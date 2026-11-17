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

    var seeded: Boolean
        get() = sp.getBoolean("seeded", false)
        set(v) = sp.edit().putBoolean("seeded", v).apply()

    var askedDefault: Boolean
        get() = sp.getBoolean("askedDefault", false)
        set(v) = sp.edit().putBoolean("askedDefault", v).apply()

    companion object {
        const val SLOTS = 4
        const val DOCK = "dock"
        const val SHORTCUTS = "shortcuts"
    }
}
