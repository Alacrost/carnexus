package com.pinturinha.app;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.*;
import android.view.*;
import android.widget.*;
import android.content.Context;
import android.graphics.drawable.GradientDrawable;
import java.util.ArrayList;
import java.util.Random;

public class MainActivity extends Activity {
    private DrawingView drawing;
    private Button eraser, undo;
    private final ArrayList<Button> swatches = new ArrayList<>();
    private final int[] colors = {0xffef5261, 0xffff9f43, 0xffffcc45, 0xff49b985, 0xff45a7e8, 0xff8570df, 0xffed83b5, 0xff765343};
    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff181b29);
        getWindow().setNavigationBarColor(0xff181b29);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xff181b29);
        root.setPadding(dp(16), dp(12), dp(16), dp(12));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(dp(16) + insets.getSystemWindowInsetLeft(), dp(12) + insets.getSystemWindowInsetTop(), dp(16) + insets.getSystemWindowInsetRight(), dp(12) + insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        TextView title = new TextView(this);
        title.setText("Pinturinha"); title.setTextColor(Color.WHITE); title.setTextSize(29); title.setTypeface(null, Typeface.BOLD);
        root.addView(title);
        TextView tip = new TextView(this);
        tip.setText("Escolha uma cor e pinte com o dedo"); tip.setTextColor(0xffbec2d3); tip.setTextSize(15); tip.setPadding(0, dp(4), 0, dp(12));
        root.addView(tip);
        drawing = new DrawingView(this);
        root.addView(drawing, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout palette = new LinearLayout(this);
        palette.setPadding(0, dp(14), 0, dp(8));
        for (int color : colors) {
            Button button = new Button(this);
            button.setContentDescription("Lápis " + colorName(color));
            button.setMinWidth(0); button.setMinimumWidth(0); button.setMinHeight(0); button.setMinimumHeight(0);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(48), 1); lp.setMargins(dp(2), 0, dp(2), 0);
            palette.addView(button, lp); swatches.add(button);
            button.setOnClickListener(v -> { drawing.color = color; drawing.erasing = false; updateTools(); });
        }
        root.addView(palette);
        LinearLayout widthRow = new LinearLayout(this); widthRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView widthLabel = new TextView(this); widthLabel.setText("Largura"); widthLabel.setTextColor(Color.WHITE); widthLabel.setTextSize(16);
        widthRow.addView(widthLabel);
        SeekBar size = new SeekBar(this); size.setMax(56); size.setProgress(16); size.setContentDescription("Largura do lápis");
        widthRow.addView(size, new LinearLayout.LayoutParams(0, dp(48), 1));
        TextView number = new TextView(this); number.setText("20"); number.setTextColor(Color.WHITE); number.setGravity(Gravity.CENTER); number.setWidth(dp(36));
        widthRow.addView(number);
        size.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) { drawing.brushWidth = progress + 4; number.setText(String.valueOf(progress + 4)); }
            public void onStartTrackingTouch(SeekBar bar) {}
            public void onStopTrackingTouch(SeekBar bar) {}
        });
        root.addView(widthRow);
        LinearLayout actions = new LinearLayout(this);
        eraser = new Button(this); eraser.setText("Borracha"); eraser.setAllCaps(false);
        undo = new Button(this); undo.setText("Desfazer"); undo.setAllCaps(false);
        LinearLayout.LayoutParams actionLp = new LinearLayout.LayoutParams(0, dp(54), 1); actionLp.setMargins(dp(3), dp(4), dp(3), 0);
        actions.addView(eraser, actionLp); actions.addView(undo, actionLp);
        eraser.setOnClickListener(v -> { drawing.erasing = !drawing.erasing; updateTools(); });
        undo.setOnClickListener(v -> { drawing.undo(); updateTools(); });
        root.addView(actions);
        setContentView(root); updateTools();
    }

    private String colorName(int color) {
        for (int i = 0; i < colors.length; i++) if (colors[i] == color) return new String[]{"vermelho", "laranja", "amarelo", "verde", "azul", "roxo", "rosa", "marrom"}[i];
        return "";
    }
    private GradientDrawable surface(int color, boolean active) {
        GradientDrawable shape = new GradientDrawable(); shape.setColor(color); shape.setCornerRadius(dp(14));
        shape.setStroke(dp(active ? 3 : 1), active ? Color.WHITE : 0xff424659); return shape;
    }
    private void updateTools() {
        for (int i = 0; i < swatches.size(); i++) {
            boolean selected = !drawing.erasing && drawing.color == colors[i];
            swatches.get(i).setBackground(surface(colors[i], selected)); swatches.get(i).setSelected(selected);
        }
        eraser.setBackground(surface(drawing.erasing ? 0xff61549c : 0xff2c3042, drawing.erasing)); eraser.setTextColor(Color.WHITE); eraser.setSelected(drawing.erasing);
        undo.setBackground(surface(0xff2c3042, false)); undo.setTextColor(Color.WHITE); undo.setEnabled(!drawing.history.isEmpty()); undo.setAlpha(undo.isEnabled() ? 1f : .45f);
    }

    private class DrawingView extends View {
        private Bitmap base, ink;
        private Canvas inkCanvas;
        private RegionMap regions;
        private final RectF paper = new RectF();
        private final Paint displayPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        private final Paint brush = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final ArrayList<Stroke> history = new ArrayList<>();
        private Stroke current;
        private Path currentClip;
        int color = colors[0]; float brushWidth = 20; boolean erasing;

        DrawingView(Context context) {
            super(context); setContentDescription("Desenho de uma casinha, árvore e sol para pintar");
            setLayerType(View.LAYER_TYPE_SOFTWARE, null);
            try {
                Bitmap original;
                try (java.io.InputStream stream = getAssets().open("desenho.png")) { original = BitmapFactory.decodeStream(stream); }
                int side = 900;
                base = Bitmap.createScaledBitmap(original, side, side, true).copy(Bitmap.Config.ARGB_8888, true);
                original.recycle();
                int[] pixels = new int[side * side]; base.getPixels(pixels, 0, side, 0, 0, side, side);
                for (int i = 0; i < pixels.length; i++) {
                    int gray = ((pixels[i] >> 16 & 255) + (pixels[i] >> 8 & 255) + (pixels[i] & 255)) / 3;
                    if (gray >= 210) pixels[i] = Color.WHITE;
                }
                base.setPixels(pixels, 0, side, 0, 0, side, side);
                regions = new RegionMap(side, side, pixels);
                ink = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888); inkCanvas = new Canvas(ink);
            } catch (Exception error) { throw new IllegalStateException("Não foi possível abrir o desenho", error); }
        }

        @Override protected void onSizeChanged(int w, int h, int oldw, int oldh) {
            float side = Math.min(w, h); paper.set((w - side) / 2, (h - side) / 2, (w + side) / 2, (h + side) / 2);
        }
        @Override protected void onDraw(Canvas canvas) {
            canvas.drawBitmap(base, null, paper, displayPaint); canvas.drawBitmap(ink, null, paper, displayPaint);
        }
        private Path regionPath(int id) {
            Path clip = new Path();
            for (int y = 0; y < regions.height; y++) {
                int x = 0;
                while (x < regions.width) {
                    if (regions.at(x, y) != id) { x++; continue; }
                    int start = x++;
                    while (x < regions.width && regions.at(x, y) == id) x++;
                    clip.addRect(start, y, x, y + 1, Path.Direction.CW);
                }
            }
            return clip;
        }
        private void setupBrush(Stroke stroke) {
            brush.reset(); brush.setAntiAlias(true); brush.setStrokeCap(Paint.Cap.ROUND); brush.setStrokeJoin(Paint.Join.ROUND); brush.setStrokeWidth(stroke.width); brush.setStyle(Paint.Style.STROKE);
            if (stroke.erase) { brush.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.CLEAR)); }
            else {
                Bitmap texture = Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888); int[] grain = new int[1024]; Random random = new Random(17);
                for (int i = 0; i < grain.length; i++) grain[i] = (stroke.color & 0x00ffffff) | ((95 + random.nextInt(100)) << 24);
                texture.setPixels(grain, 0, 32, 0, 0, 32, 32);
                brush.setShader(new BitmapShader(texture, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT));
            }
        }
        private void segment(float x0, float y0, float x1, float y1, Path clip) {
            inkCanvas.save(); inkCanvas.clipPath(clip);
            if (x0 == x1 && y0 == y1) inkCanvas.drawPoint(x0, y0, brush);
            else inkCanvas.drawLine(x0, y0, x1, y1, brush);
            inkCanvas.restore();
        }
        @Override public boolean onTouchEvent(android.view.MotionEvent event) {
            if (paper.width() <= 0) return false;
            float x = (event.getX() - paper.left) * base.getWidth() / paper.width();
            float y = (event.getY() - paper.top) * base.getHeight() / paper.height();
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    if (!paper.contains(event.getX(), event.getY())) return false;
                    int id = regions.at((int)x, (int)y); if (id < 1) return false;
                    getParent().requestDisallowInterceptTouchEvent(true);
                    current = new Stroke(id, color, brushWidth, erasing); current.points.add(new PointF(x, y));
                    currentClip = regionPath(id); setupBrush(current); segment(x, y, x, y, currentClip); invalidate(); return true;
                case MotionEvent.ACTION_MOVE:
                    if (current == null) return false;
                    for (int i = 0; i < event.getHistorySize(); i++) append((event.getHistoricalX(i) - paper.left) * base.getWidth() / paper.width(), (event.getHistoricalY(i) - paper.top) * base.getHeight() / paper.height());
                    append(x, y); invalidate(); return true;
                case MotionEvent.ACTION_UP:
                    if (current != null) { append(x, y); history.add(current); current = null; currentClip = null; updateTools(); invalidate(); performClick(); }
                    getParent().requestDisallowInterceptTouchEvent(false); return true;
                case MotionEvent.ACTION_CANCEL:
                    if (current != null) { current = null; currentClip = null; replay(); }
                    getParent().requestDisallowInterceptTouchEvent(false); return true;
                default: return current != null;
            }
        }
        @Override public boolean performClick() { super.performClick(); return true; }
        private void append(float x, float y) {
            PointF last = current.points.get(current.points.size() - 1);
            if (last.x == x && last.y == y) return;
            segment(last.x, last.y, x, y, currentClip); current.points.add(new PointF(x, y));
        }
        void undo() { if (!history.isEmpty()) { history.remove(history.size() - 1); replay(); } }
        private void replay() {
            ink.eraseColor(Color.TRANSPARENT);
            for (Stroke stroke : history) {
                Path clip = regionPath(stroke.region); setupBrush(stroke);
                PointF first = stroke.points.get(0); segment(first.x, first.y, first.x, first.y, clip);
                for (int i = 1; i < stroke.points.size(); i++) { PointF a = stroke.points.get(i - 1), b = stroke.points.get(i); segment(a.x, a.y, b.x, b.y, clip); }
            }
            invalidate();
        }
    }
    private static class Stroke {
        final int region, color; final float width; final boolean erase; final ArrayList<PointF> points = new ArrayList<>();
        Stroke(int region, int color, float width, boolean erase) { this.region = region; this.color = color; this.width = width; this.erase = erase; }
    }
}
