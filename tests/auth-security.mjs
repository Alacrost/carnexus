import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
const root = path.resolve(import.meta.dirname, '..');

// Execute the real handlers with deterministic Auth responses, without contacting a project.
function load(relative, mocks, cache = new Map()) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (specifier) => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const target = specifier.startsWith('@/')
        ? path.join(root, 'src', specifier.slice(2))
        : path.resolve(path.dirname(filename), specifier);
      return load(path.relative(root, `${target}.ts`), mocks, cache);
    }
    return require(specifier);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const originalEnv = { ...process.env };
try {
  process.env.NODE_ENV = 'production';
  process.env.NEXT_PUBLIC_DEMO_MODE = 'true';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://auth-test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
  let user = null;
  let authError = null;
  let authCalls = 0;
  const { updateSession } = load('src/lib/supabase/middleware.ts', {
    '@supabase/ssr': {
      createServerClient(_url, _key, options) {
        return { auth: { async getUser() {
          authCalls++;
          options.cookies.setAll([{ name: 'sb-test-session', value: 'refreshed', options: { httpOnly: true, path: '/' } }], { 'Cache-Control': 'private, no-store' });
          return { data: { user }, error: authError };
        } } };
      },
    },
    'next/server': { NextResponse },
  });
  for (const route of ['/dashboard', '/inventory/123', '/agreement', '/onboarding', '/leads/export', '/pending', '/website', '/deal-doc/example']) {
    const response = await updateSession(new NextRequest(`https://app.example${route}?filter=open`));
    assert.equal(response.status, 307, `${route} must require authentication even with production demo flag`);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.pathname, '/login');
    assert.equal(location.searchParams.get('next'), `${route}?filter=open`);
    assert.equal(response.cookies.get('sb-test-session')?.value, 'refreshed', 'redirect must preserve session refresh');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  for (const route of ['/', '/login', '/signup', '/s/example/car/123', '/auth/callback', '/promo/example', '/invite/example', '/inventory-public']) {
    const response = await updateSession(new NextRequest(`https://app.example${route}`));
    assert.equal(response.status, 200, `${route} must stay public`);
  }
  user = { id: 'verified-user' };
  assert.equal((await updateSession(new NextRequest('https://app.example/inventory'))).status, 200);
  const signedInLogin = await updateSession(new NextRequest('https://app.example/login'));
  assert.equal(new URL(signedInLogin.headers.get('location')).pathname, '/dashboard');
  assert.equal(signedInLogin.cookies.get('sb-test-session')?.value, 'refreshed');
  authError = new Error('invalid token');
  assert.equal((await updateSession(new NextRequest('https://app.example/dashboard'))).status, 307, 'auth error must fail closed');
  const callsBeforeDemo = authCalls;
  process.env.NODE_ENV = 'development';
  assert.equal((await updateSession(new NextRequest('https://app.example/dashboard'))).status, 200);
  assert.equal(authCalls, callsBeforeDemo, 'existing development demo bypass must remain');
  console.log('PASS: protected/public routes, query return path, refresh cookies, fail-closed Auth, production and development demo behavior.');

  let rpcCalls = 0;
  let signupSession = null;
  let providerError = null;
  let signupOptions;
  process.env.AUTH_SITE_URL = 'https://app.example';
  const authClient = {
    auth: {
      signInWithPassword: async () => ({ error: providerError }),
      signUp: async (options) => { signupOptions = options; return { data: { session: signupSession }, error: null }; },
      exchangeCodeForSession: async () => ({ error: providerError }),
      verifyOtp: async () => ({ error: providerError }),
    },
    rpc: async () => { rpcCalls++; return { error: providerError }; },
  };
  const mocks = {
    '@/lib/supabase/server': { createClient: async () => authClient },
    'next/navigation': { redirect(destination) { throw new Error(`REDIRECT:${destination}`); } },
    'next/server': { NextResponse },
  };
  const actions = load('src/app/(auth)/actions.ts', mocks);
  const form = (fields) => {
    const result = new FormData();
    for (const [key, value] of Object.entries(fields)) result.set(key, value);
    return result;
  };
  for (const next of ['//evil.example', 'https://evil.example', '/\\evil.example']) {
    await assert.rejects(actions.login({}, form({ email: 'user@example.com', password: 'password123', next })), { message: 'REDIRECT:/dashboard' });
  }
  await assert.rejects(actions.login({}, form({ email: 'user@example.com', password: 'password123', next: '/inventory' })), { message: 'REDIRECT:/inventory' });
  await assert.rejects(actions.login({}, form({ email: 'user@example.com', password: 'password123', next: '/inventory?filter=open&search=Ford%20Fiesta' })), { message: 'REDIRECT:/inventory?filter=open&search=Ford%20Fiesta' });
  providerError = new Error('unknown account');
  assert.equal((await actions.login({}, form({ email: 'user@example.com', password: 'password123' }))).error, 'Invalid email or password.');
  providerError = null;
  const signupForm = form({ fullName: 'Test User', dealerName: 'Test Motors', email: 'user@example.com', password: 'password123' });
  await assert.rejects(actions.signup({}, signupForm), { message: 'REDIRECT:/login?message=confirm-email' });
  assert.equal(rpcCalls, 0, 'unconfirmed signup must not attempt dealership creation');
  assert.equal(signupOptions.options.emailRedirectTo, 'https://app.example/auth/callback');
  for (const origin of ['', 'http://evil.example', 'https://app.example/path', 'https://user:pass@app.example']) {
    process.env.AUTH_SITE_URL = origin;
    signupOptions = undefined;
    assert.ok((await actions.signup({}, signupForm)).error);
    assert.equal(signupOptions, undefined, 'invalid configured origin must prevent signup');
  }
  process.env.AUTH_SITE_URL = 'http://localhost:3000';
  await assert.rejects(actions.signup({}, signupForm), { message: 'REDIRECT:/login?message=confirm-email' });
  assert.equal(signupOptions.options.emailRedirectTo, 'http://localhost:3000/auth/callback');
  process.env.NODE_ENV = 'production';
  assert.ok((await actions.signup({}, signupForm)).error, 'production must require HTTPS');
  process.env.AUTH_SITE_URL = 'https://app.example';
  signupSession = { user: { id: 'test-user' } };
  await assert.rejects(actions.signup({}, signupForm), { message: 'REDIRECT:/dashboard' });
  assert.equal(rpcCalls, 1);
  providerError = new Error('RPC unavailable');
  await assert.rejects(actions.signup({}, signupForm), { message: 'REDIRECT:/onboarding' });
  providerError = null;
  for (const [file, query] of [['callback', 'code=test-code'], ['confirm', 'token_hash=test-token&type=email']]) {
    const { GET } = load(`src/app/auth/${file}/route.ts`, mocks);
    const success = await GET(new NextRequest(`https://app.example/auth/${file}?${query}&next=https://evil.example`));
    assert.equal(success.headers.get('location'), 'https://app.example/dashboard');
    assert.equal(success.headers.get('cache-control'), 'private, no-store');
    assert.equal((await GET(new NextRequest(`https://app.example/auth/${file}`))).headers.get('location'), 'https://app.example/login');
    providerError = new Error('expired');
    assert.equal((await GET(new NextRequest(`https://app.example/auth/${file}?${query}`))).headers.get('location'), 'https://app.example/login');
    providerError = null;
  }
  console.log('PASS: login rejects external redirects, Auth errors stay generic, signup waits for session, and confirmation callbacks handle valid/expired/missing credentials.');
} finally {
  for (const key of Object.keys(process.env)) if (!Object.hasOwn(originalEnv, key)) delete process.env[key];
  Object.assign(process.env, originalEnv);
}
