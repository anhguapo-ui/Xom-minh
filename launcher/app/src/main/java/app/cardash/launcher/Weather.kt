package app.cardash.launcher

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import kotlin.math.roundToInt

/** Thời tiết hiện tại theo toạ độ, lấy từ Open-Meteo (miễn phí, không cần khoá). */
class Weather(private val onUpdate: () -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    private var loading = false
    private var nextFetchAt = 0L

    var temp: Int? = null
        private set
    var high: Int? = null
        private set
    var low: Int? = null
        private set
    var code = -1
        private set

    /** Tải lại nếu đã quá 30 phút; [force] để tải ngay. */
    fun refresh(lat: Double, lon: Double, force: Boolean = false) {
        val now = SystemClock.elapsedRealtime()
        if (loading || (!force && now < nextFetchAt)) return
        loading = true
        Thread {
            var ok = false
            try {
                val url = String.format(
                    Locale.US,
                    "https://api.open-meteo.com/v1/forecast?latitude=%.3f&longitude=%.3f" +
                        "&current=temperature_2m,weather_code" +
                        "&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto",
                    lat, lon
                )
                val conn = URL(url).openConnection() as HttpURLConnection
                conn.connectTimeout = 8000
                conn.readTimeout = 8000
                try {
                    val json = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
                    val current = json.getJSONObject("current")
                    val daily = json.getJSONObject("daily")
                    val t = current.getDouble("temperature_2m").roundToInt()
                    val c = current.getInt("weather_code")
                    val hi = daily.getJSONArray("temperature_2m_max").getDouble(0).roundToInt()
                    val lo = daily.getJSONArray("temperature_2m_min").getDouble(0).roundToInt()
                    main.post {
                        temp = t
                        code = c
                        high = hi
                        low = lo
                    }
                    ok = true
                } finally {
                    conn.disconnect()
                }
            } catch (e: Exception) {
                // Mất mạng hoặc máy chủ lỗi: thử lại sau 2 phút.
            }
            val wait = if (ok) 30 * 60_000L else 2 * 60_000L
            main.post {
                loading = false
                nextFetchAt = SystemClock.elapsedRealtime() + wait
                onUpdate()
            }
        }.start()
    }

    /** Mô tả tiếng Việt theo mã thời tiết WMO. */
    val description: String
        get() = when (code) {
            0 -> "Trời quang"
            1, 2 -> "Ít mây"
            3 -> "Nhiều mây"
            45, 48 -> "Sương mù"
            in 51..57 -> "Mưa phùn"
            in 61..67 -> "Mưa"
            in 71..77 -> "Tuyết"
            in 80..82 -> "Mưa rào"
            in 85..86 -> "Tuyết"
            in 95..99 -> "Dông"
            else -> ""
        }

    val glyph: Int
        get() = when (code) {
            0, 1 -> Glyph.SUN
            in 51..67, in 80..82, in 95..99 -> Glyph.RAIN
            else -> Glyph.CLOUD
        }
}
