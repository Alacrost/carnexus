import com.pinturinha.app.RegionMap;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.HashSet;

public class RegionMapTest {
    public static void main(String[] args) throws Exception {
        BufferedImage original = ImageIO.read(new File("app/src/main/assets/desenho.png"));
        BufferedImage image = new BufferedImage(900, 900, BufferedImage.TYPE_INT_RGB);
        java.awt.Graphics2D graphics = image.createGraphics();
        graphics.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION, java.awt.RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        graphics.drawImage(original, 0, 0, 900, 900, null);
        graphics.dispose();
        int w = image.getWidth(), h = image.getHeight();
        int[] pixels = image.getRGB(0, 0, w, h, null, 0, w);
        RegionMap map = new RegionMap(w, h, pixels);
        // Independently chosen interior points: roof, wall, door, sun, canopy, trunk.
        int[][] samples = {{600,450}, {700,650}, {740,820}, {1040,210}, {210,600}, {205,900}};
        HashSet<Integer> seen = new HashSet<>();
        for (int[] p : samples) {
            int id = map.at(p[0] * w / 1254, p[1] * h / 1254);
            if (id < 1 || !seen.add(id)) throw new AssertionError("As partes principais devem ser áreas fechadas diferentes");
        }
        if (map.at(-1, 0) != -1 || map.at(w, h) != -1) throw new AssertionError("Limites inválidos");
        for (int i = 0; i < pixels.length; i++) {
            int c = pixels[i];
            if ((c & 255) < 80 && map.labels[i] != -1) throw new AssertionError("Contorno não pode ser pintado");
        }
        System.out.println("PASS: seis partes distintas; contornos protegidos; limites seguros; " + map.count + " áreas no desenho.");
    }
}
