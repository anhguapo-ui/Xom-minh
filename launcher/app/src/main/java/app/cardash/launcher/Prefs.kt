package app.cardash.launcher

import android.content.Context

/** Lưu lựa chọn của người dùng: app ghim ở thanh bên, lối tắt, app ẩn, hình nền. */
class Prefs(ctx: Context) {
    private val sp = ctx.getSharedPreferences("cardash", Context.MODE_PRIVATE)

    /** Danh sách ô cố định [SLOTS] phần tử; ô trống là chuỗi rỗng. */
    fun slots(key: String): MutableList<String> {
        val raw = sp.getString(key, "") ?: ""
        val list = raw.split('\n').toMutableList()
        while (list.size < SLOTS) list.add("")
        return list.subList(0, SLOTS).toMutableList()
    }

    fun setSlots(key: String, value: List<String>) {
        sp.edit().putString(key, value.joinToString("\n")).apply()
    }

    var hidden: Set<String>
        get() = sp.getStringSet("hidden", emptySet())?.toSet() ?: emptySet()
        set(v) = sp.edit().putStringSet("hidden", v).apply()

    var wallpaper: Int
        get() = sp.getInt("wallpaper", 0)
        set(v) = sp.edit().putInt("wallpaper", v).apply()

    /** true: dùng ảnh người dùng chọn làm nền; false: dùng nền màu. */
    var wallpaperImage: Boolean
        get() = sp.getBoolean("wallpaperImage", false)
        set(v) = sp.edit().putBoolean("wallpaperImage", v).apply()

    var accent: Int
        get() = sp.getInt("accent", 0)
        set(v) = sp.edit().putInt("accent", v).apply()

    /** Lề thêm ở trên/dưới (tính theo bậc) cho màn có thanh điều khiển của xe che mất. */
    var padTop: Int
        get() = sp.getInt("padTop", 0)
        set(v) = sp.edit().putInt("padTop", v.coerceIn(0, 12)).apply()

    var padBottom: Int
        get() = sp.getInt("padBottom", 0)
        set(v) = sp.edit().putInt("padBottom", v.coerceIn(0, 12)).apply()

    /** true: bản đồ xoay theo hướng xe; false: hướng Bắc luôn ở trên. */
    var headingUp: Boolean
        get() = sp.getBoolean("headingUp", true)
        set(v) = sp.edit().putBoolean("headingUp", v).apply()

    var askedLocation: Boolean
        get() = sp.getBoolean("askedLocation", false)
        set(v) = sp.edit().putBoolean("askedLocation", v).apply()

    var seeded: Boolean
        get() = sp.getBoolean("seeded", false)
        set(v) = sp.edit().putBoolean("seeded", v).apply()

    var askedDefault: Boolean
        get() = sp.getBoolean("askedDefault", false)
        set(v) = sp.edit().putBoolean("askedDefault", v).apply()

    companion object {
        const val SLOTS = 8
        const val DOCK = "dock"
    }
}
