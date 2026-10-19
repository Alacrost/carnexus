import {createHash} from "node:crypto";

/** Stable aliases for existing links such as inventory/v1. Server-only. */
export function demoEntityId(value:string|undefined):string|undefined {
  if(!value||/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value))return value;
  const hex=createHash("sha256").update(`autonexus-local-demo:${value}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
