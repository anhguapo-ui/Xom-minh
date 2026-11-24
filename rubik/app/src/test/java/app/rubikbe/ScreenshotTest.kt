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
        call(activity, "sample")
        waitSolved(activity)
        shot(activity, "$prefix-3-solve-fast")
        clickText(activity, "Học giải")
        shot(activity, "$prefix-4-solve-learn")
        clickText(activity, "‹ Về")
        shot(activity, "$prefix-2-paint")
    }

    @Test
    @Config(qualifiers = "w400dp-h860dp-port-xhdpi")
    fun phone() = run("phone")

    @Test
    @Config(qualifiers = "w860dp-h400dp-land-xhdpi")
    fun landscape() = run("land")
}
