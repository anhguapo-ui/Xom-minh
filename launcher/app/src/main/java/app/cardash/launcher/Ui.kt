package app.cardash.launcher

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.text.TextUtils
import android.view.Gravity
import android.widget.TextView

object Ui {
    const val TEXT = 0xFFFFFFFF.toInt()
    const val TEXT_DIM = 0xB3FFFFFF.toInt()
    const val CARD = 0x24FFFFFF
    const val DOCK = 0x59000000
    const val ACCENT = 0xFF4DA3FF.toInt()

    /** Các bộ màu nền; đổi trong phần Cài đặt. */
    val WALLPAPERS = arrayOf(
        intArrayOf(0xFF0B1226.toInt(), 0xFF1D3461.toInt(), 0xFF3A2466.toInt()),
        intArrayOf(0xFF08141A.toInt(), 0xFF0F4C5C.toInt(), 0xFF1B6B4A.toInt()),
        intArrayOf(0xFF1A0B14.toInt(), 0xFF6B1E3F.toInt(), 0xFFB5532A.toInt()),
        intArrayOf(0xFF050505.toInt(), 0xFF141414.toInt(), 0xFF262626.toInt())
    )

    fun wallpaper(index: Int): Drawable {
        val colors = WALLPAPERS[((index % WALLPAPERS.size) + WALLPAPERS.size) % WALLPAPERS.size]
        return GradientDrawable(GradientDrawable.Orientation.TL_BR, colors)
    }

    fun rounded(color: Int, radius: Float): GradientDrawable = GradientDrawable().apply {
        setColor(color)
        cornerRadius = radius
    }

    /** Nền bo góc có hiệu ứng gợn khi chạm. */
    fun pressable(color: Int, radius: Float): Drawable = RippleDrawable(
        ColorStateList.valueOf(0x40FFFFFF),
        rounded(color, radius),
        rounded(0xFFFFFFFF.toInt(), radius)
    )

    fun text(
        ctx: Context,
        sizeSp: Float,
        color: Int = TEXT,
        bold: Boolean = false,
        lines: Int = 1,
        center: Boolean = false
    ): TextView = TextView(ctx).apply {
        textSize = sizeSp
        setTextColor(color)
        if (bold) typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        maxLines = lines
        ellipsize = TextUtils.TruncateAt.END
        if (center) gravity = Gravity.CENTER
        includeFontPadding = false
    }
}

/** Biểu tượng nét đơn giản tự vẽ, không dùng tệp ảnh. */
class Glyph(private val kind: Int, color: Int = Ui.TEXT) : Drawable() {
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }

    override fun draw(canvas: Canvas) {
        val b = bounds
        val s = minOf(b.width(), b.height()).toFloat()
        if (s <= 0f) return
        canvas.save()
        canvas.translate(b.left + (b.width() - s) / 2f, b.top + (b.height() - s) / 2f)
        stroke.strokeWidth = s * 0.09f
        when (kind) {
            PLAY -> canvas.drawPath(triangle(s, 0.32f, 0.78f), fill)
            PAUSE -> {
                canvas.drawRoundRect(RectF(s * .27f, s * .22f, s * .43f, s * .78f), s * .04f, s * .04f, fill)
                canvas.drawRoundRect(RectF(s * .57f, s * .22f, s * .73f, s * .78f), s * .04f, s * .04f, fill)
            }
            NEXT -> {
                canvas.drawPath(triangle(s, 0.20f, 0.52f), fill)
                canvas.drawPath(triangle(s, 0.50f, 0.82f), fill)
            }
            PREV -> {
                canvas.scale(-1f, 1f, s / 2f, s / 2f)
                canvas.drawPath(triangle(s, 0.20f, 0.52f), fill)
                canvas.drawPath(triangle(s, 0.50f, 0.82f), fill)
            }
            GRID -> for (r in 0..2) for (c in 0..2) {
                val x = s * (0.24f + 0.26f * c)
                val y = s * (0.24f + 0.26f * r)
                canvas.drawRoundRect(
                    RectF(x - s * .09f, y - s * .09f, x + s * .09f, y + s * .09f),
                    s * .035f, s * .035f, fill
                )
            }
            DASH -> {
                val r = s * .06f
                canvas.drawRoundRect(RectF(s * .16f, s * .2f, s * .50f, s * .8f), r, r, fill)
                canvas.drawRoundRect(RectF(s * .56f, s * .2f, s * .84f, s * .47f), r, r, fill)
                canvas.drawRoundRect(RectF(s * .56f, s * .53f, s * .84f, s * .8f), r, r, fill)
            }
            PLUS -> {
                canvas.drawLine(s * .5f, s * .28f, s * .5f, s * .72f, stroke)
                canvas.drawLine(s * .28f, s * .5f, s * .72f, s * .5f, stroke)
            }
            GEAR -> {
                canvas.drawCircle(s / 2f, s / 2f, s * .2f, stroke)
                for (i in 0 until 8) {
                    canvas.save()
                    canvas.rotate(45f * i, s / 2f, s / 2f)
                    canvas.drawLine(s / 2f, s * .16f, s / 2f, s * .22f, stroke)
                    canvas.restore()
                }
            }
            NOTE -> {
                canvas.drawOval(RectF(s * .24f, s * .60f, s * .44f, s * .76f), fill)
                canvas.drawOval(RectF(s * .56f, s * .52f, s * .76f, s * .68f), fill)
                stroke.strokeWidth = s * .06f
                canvas.drawLine(s * .41f, s * .68f, s * .41f, s * .28f, stroke)
                canvas.drawLine(s * .73f, s * .60f, s * .73f, s * .22f, stroke)
                canvas.drawLine(s * .41f, s * .28f, s * .73f, s * .22f, stroke)
            }
        }
        canvas.restore()
    }

    private fun triangle(s: Float, left: Float, right: Float) = Path().apply {
        moveTo(s * left, s * .24f)
        lineTo(s * right, s * .5f)
        lineTo(s * left, s * .76f)
        close()
    }

    override fun setAlpha(alpha: Int) {
        fill.alpha = alpha
        stroke.alpha = alpha
    }

    override fun setColorFilter(colorFilter: ColorFilter?) {
        fill.colorFilter = colorFilter
        stroke.colorFilter = colorFilter
    }

    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT

    companion object {
        const val PLAY = 0
        const val PAUSE = 1
        const val NEXT = 2
        const val PREV = 3
        const val GRID = 4
        const val DASH = 5
        const val PLUS = 6
        const val GEAR = 7
        const val NOTE = 8
    }
}
