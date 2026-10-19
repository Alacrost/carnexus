package com.pinturinha.app;

/** Connected white areas, computed once; pencil strokes stay in their starting area. */
public final class RegionMap {
    public final int width, height;
    public final int[] labels;
    public final int count;

    public RegionMap(int width, int height, int[] pixels) {
        this.width = width;
        this.height = height;
        labels = new int[pixels.length];
        for (int i = 0; i < pixels.length; i++) {
            int c = pixels[i];
            if (((c >> 16) & 255) < 210 || ((c >> 8) & 255) < 210 || (c & 255) < 210) labels[i] = -1;
        }
        int[] queue = new int[pixels.length];
        int regions = 0;
        for (int i = 0; i < pixels.length; i++) {
            if (labels[i] != 0) continue;
            int label = ++regions;
            int head = 0, tail = 0;
            queue[tail++] = i;
            labels[i] = label;
            while (head < tail) {
                int p = queue[head++];
                int x = p % width;
                if (x > 0 && labels[p - 1] == 0) { labels[p - 1] = label; queue[tail++] = p - 1; }
                if (x + 1 < width && labels[p + 1] == 0) { labels[p + 1] = label; queue[tail++] = p + 1; }
                if (p >= width && labels[p - width] == 0) { labels[p - width] = label; queue[tail++] = p - width; }
                if (p + width < labels.length && labels[p + width] == 0) { labels[p + width] = label; queue[tail++] = p + width; }
            }
        }
        count = regions;
    }

    public int at(int x, int y) {
        return x < 0 || y < 0 || x >= width || y >= height ? -1 : labels[y * width + x];
    }
}
