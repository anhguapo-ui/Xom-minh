package app.rubikbe

import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Looper
import android.view.View
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream

/** Chụp ảnh các màn hình chính để xem giao diện mà không cần điện thoại. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34])
class ScreenshotTest {
    private val out = File("build/screens").apply { mkdirs() }

    private fun idle() = shadowOf(Looper.getMainLooper()).idle()

    private fun shot(activity: MainActivity, name: String) {
        idle()
        shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(800))
        val root = activity.window.decorView
        val bmp = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
        root.draw(Canvas(bmp))
        FileOutputStream(File(out, "$name.png")).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun call(activity: MainActivity, method: String, vararg args: Any) {
        val m = MainActivity::class.java.declaredMethods.first { it.name == method && it.parameterCount == args.size }
        m.isAccessible = true
        m.invoke(activity, *args)
    }

    private fun field(activity: MainActivity, name: String): Any? {
        val f = MainActivity::class.java.getDeclaredField(name)
        f.isAccessible = true
        return f.get(activity)
    }

    private fun waitSolved(activity: MainActivity) {
        val start = System.currentTimeMillis()
        while (field(activity, "fastSteps") == null && System.currentTimeMillis() - start < 60_000) {
            Thread.sleep(50)
            idle()
        }
        idle()
    }

    private fun clickText(activity: MainActivity, text: String) {
        fun find(v: View): View? {
            if (v is android.widget.TextView && v.text.toString().contains(text)) return v
            if (v is android.view.ViewGroup) for (i in 0 until v.childCount) find(v.getChildAt(i))?.let { return it }
            return null
        }
        find(activity.window.decorView)?.performClick()
        idle()
    }

    private fun run(prefix: String) {
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        shot(activity, "$prefix-1-home")
        clickText(activity, "Nhập khối")
        // Tô vài ô trên mặt trước như bé chạm vào khối.
        call(activity, "pickBrush", 5)
        for (i in intArrayOf(18, 19, 22, 26)) call(activity, "paintCell", i)
        call(activity, "pickBrush", 2)
        for (i in intArrayOf(20, 23, 9)) call(activity, "paintCell", i)
        shot(activity, "$prefix-2-input-painting")
        call(activity, "sample")
        waitSolved(activity)
        shot(activity, "$prefix-4-solve-fast")
        clickText(activity, "Học giải")
        shot(activity, "$prefix-5-solve-learn")
        // Tô nhầm một ô rồi bấm giải: app phải khoanh đỏ ô đó.
        val colors = field(activity, "colors") as IntArray
        colors[19] = (colors[19] + 1) % 6
        call(activity, "startSolve")
        shot(activity, "$prefix-3-input-error")
    }

    @Test
    @Config(qualifiers = "w400dp-h860dp-port-xhdpi")
    fun phone() = run("phone")

    @Test
    @Config(qualifiers = "w860dp-h400dp-land-xhdpi")
    fun landscape() = run("land")
}
