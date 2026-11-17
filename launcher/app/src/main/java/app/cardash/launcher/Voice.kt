package app.cardash.launcher

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Một lệnh đã hiểu được từ câu nói: việc cần làm và câu trả lời để đọc lại. */
class Command(val action: String, val query: String, val app: String, val reply: String) {
    companion object {
        const val OPEN_APP = "open_app"
        const val NAVIGATE = "navigate"
        const val YOUTUBE = "youtube"
        const val PLAY = "media_play"
        const val PAUSE = "media_pause"
        const val NEXT = "media_next"
        const val PREVIOUS = "media_previous"
        const val HOME = "home"
        const val ANSWER = "answer"

        /**
         * Hiểu vài câu lệnh đơn giản ngay trên máy, không cần mạng hay khoá Gemini.
         * Trả về null nếu câu nói không khớp mẫu nào.
         */
        fun local(text: String): Command? {
            val t = text.trim().lowercase().trimEnd('.', '!', '?')
            Regex("^(?:chỉ đường|dẫn đường|đưa tôi|đi)(?: đến| tới| về| đi)? (.+)$").find(t)?.let {
                val place = it.groupValues[1]
                return Command(NAVIGATE, place, "", "Đang chỉ đường tới $place")
            }
            Regex("^(?:mở|bật|phát|tìm|xem) (.+?) (?:trên|bằng|ở) youtube$").find(t)?.let {
                return Command(YOUTUBE, it.groupValues[1], "", "Đang tìm ${it.groupValues[1]} trên YouTube")
            }
            Regex("^youtube (.+)$").find(t)?.let {
                return Command(YOUTUBE, it.groupValues[1], "", "Đang tìm ${it.groupValues[1]} trên YouTube")
            }
            when {
                Regex("(bài|bản) (tiếp|kế|sau)|chuyển bài|qua bài").containsMatchIn(t) ->
                    return Command(NEXT, "", "", "Chuyển bài kế")
                Regex("(bài|bản) trước|lùi bài").containsMatchIn(t) ->
                    return Command(PREVIOUS, "", "", "Về bài trước")
                Regex("(tạm )?dừng( nhạc)?$|tắt nhạc|ngừng nhạc").containsMatchIn(t) ->
                    return Command(PAUSE, "", "", "Đã dừng nhạc")
                Regex("^(phát|bật|mở) nhạc$|tiếp tục( phát)?$").containsMatchIn(t) ->
                    return Command(PLAY, "", "", "Đang phát nhạc")
                Regex("^(về )?(màn hình chính|trang chính|bản đồ)$").containsMatchIn(t) ->
                    return Command(HOME, "", "", "Đã về trang chính")
            }
            Regex("^(?:mở|bật|vào) (.+)$").find(t)?.let {
                return Command(OPEN_APP, "", it.groupValues[1], "Đang mở ${it.groupValues[1]}")
            }
            return null
        }
    }
}

/** Gọi Gemini để hiểu câu nói và trả về [Command]. Mọi hàm ở đây chạy trên luồng nền. */
object Gemini {
    private const val BASE = "https://generativelanguage.googleapis.com/v1beta/"
    /** Các model dùng được với khoá hiện tại, xếp theo thứ tự ưu tiên; model vừa chạy tốt nằm đầu. */
    private var models: List<String> = emptyList()

    fun ask(key: String, text: String, apps: List<String>, context: String): Command {
        val system = """
            Bạn là trợ lý giọng nói trên màn hình ô tô. Người lái nói tiếng Việt và cần câu trả lời thật ngắn.
            Trả về DUY NHẤT một đối tượng JSON với đúng bốn trường chuỗi:
            - "action": một trong open_app, navigate, youtube, media_play, media_pause, media_next, media_previous, home, answer.
            - "query": điểm đến đối với navigate; từ khoá tìm kiếm đối với youtube; các trường hợp khác để "".
            - "app": tên ứng dụng lấy đúng nguyên văn từ danh sách đã cài, chỉ dùng cho open_app; còn lại để "".
            - "reply": câu tiếng Việt để đọc thành tiếng, tối đa hai câu, không dùng ký hiệu hay markdown.
            Quy tắc:
            - Muốn đi đâu, hỏi đường, tìm địa điểm: navigate.
            - Muốn xem video, hoặc nghe một bài hát cụ thể: youtube với query là tên video hay bài hát.
            - Phát tiếp, dừng, chuyển bài đang nghe: các action media_*.
            - Về màn hình chính hoặc xem bản đồ: home.
            - Câu hỏi kiến thức, trò chuyện, tính toán: answer và trả lời trực tiếp trong reply.
            - Không chắc người lái muốn gì: answer và hỏi lại ngắn gọn.
            Ứng dụng đã cài: ${apps.joinToString(", ")}.
            Bối cảnh hiện tại: $context
        """.trimIndent()
        val body = JSONObject()
            .put("systemInstruction", JSONObject().put("parts", JSONArray().put(JSONObject().put("text", system))))
            .put(
                "contents",
                JSONArray().put(
                    JSONObject().put("role", "user")
                        .put("parts", JSONArray().put(JSONObject().put("text", text)))
                )
            )
            .put(
                "generationConfig",
                JSONObject().put("responseMimeType", "application/json").put("temperature", 0.3)
            )
        if (models.isEmpty()) models = listModels(key)
        // Model hay bị quá tải theo lúc: thử lần lượt tối đa ba cái, cái nào trả lời thì dùng.
        var response: JSONObject? = null
        var failure: Exception? = null
        for (name in models.take(3)) {
            try {
                response = JSONObject(http("POST", "$name:generateContent", key, body.toString()))
                models = listOf(name) + models.filter { it != name }
                break
            } catch (e: ApiError) {
                failure = e
                // Sai khoá hoặc hết hạn mức thì đổi model cũng vô ích.
                if (e.code == 400 || e.code == 401 || e.code == 403) break
            } catch (e: java.io.IOException) {
                failure = ApiError(0, "máy chủ không phản hồi kịp")
            }
        }
        if (response == null) {
            // Lần sau dò lại danh sách, phòng khi model đã bị gỡ.
            models = emptyList()
            throw failure ?: ApiError(0, "không gọi được Gemini")
        }
        val parts = response.optJSONArray("candidates")?.optJSONObject(0)
            ?.optJSONObject("content")?.optJSONArray("parts")
            ?: throw ApiError(0, "Gemini không trả lời câu này")
        val raw = StringBuilder()
        for (i in 0 until parts.length()) raw.append(parts.optJSONObject(i)?.optString("text") ?: "")
        val start = raw.indexOf("{")
        val end = raw.lastIndexOf("}")
        if (start < 0 || end <= start) return Command(Command.ANSWER, "", "", raw.toString().trim())
        val json = JSONObject(raw.substring(start, end + 1))
        return Command(
            json.optString("action", Command.ANSWER),
            json.optString("query"),
            json.optString("app"),
            json.optString("reply")
        )
    }

    /**
     * Lấy danh sách model của khoá và xếp ưu tiên: dòng "flash-lite" trước vì trả lời trong
     * khoảng một giây (hợp với ra lệnh khi lái xe), bản mới trước bản cũ, rồi mới tới "flash".
     */
    private fun listModels(key: String): List<String> {
        val fallback = listOf("models/gemini-flash-lite-latest", "models/gemini-flash-latest")
        val list = JSONObject(http("GET", "models?pageSize=200", key, null)).optJSONArray("models")
            ?: return fallback
        val skip = listOf("tts", "image", "live", "audio", "embedding", "thinking", "exp", "robotics", "omni", "preview")
        val names = ArrayList<String>()
        for (i in 0 until list.length()) {
            val m = list.optJSONObject(i) ?: continue
            val name = m.optString("name")
            val methods = m.optJSONArray("supportedGenerationMethods")?.toString() ?: ""
            if ("generateContent" !in methods || "flash" !in name) continue
            if (skip.any { it in name }) continue
            names.add(name)
        }
        fun version(name: String) =
            Regex("gemini-(\\d+(?:\\.\\d+)?)-").find(name)?.groupValues?.get(1)?.toDoubleOrNull() ?: 99.0
        val (lite, full) = names.sortedByDescending { version(it) }.partition { "lite" in it }
        return (lite + full).ifEmpty { fallback }
    }

    class ApiError(val code: Int, message: String) : Exception(message)

    private fun http(method: String, path: String, key: String, body: String?): String {
        val conn = URL(BASE + path).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = 6_000
        conn.readTimeout = 12_000
        conn.setRequestProperty("x-goog-api-key", key)
        try {
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.outputStream.use { it.write(body.toByteArray()) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            if (code !in 200..299) {
                val detail = try {
                    JSONObject(text).optJSONObject("error")?.optString("message")
                } catch (e: Exception) {
                    null
                }
                throw ApiError(code, "mã $code" + if (detail.isNullOrEmpty()) "" else ": $detail")
            }
            return text
        } finally {
            conn.disconnect()
        }
    }
}

/** Nhận giọng nói tiếng Việt bằng dịch vụ có sẵn của Android. Dùng trên luồng chính. */
class VoiceInput(
    private val ctx: Context,
    private val onPartial: (String) -> Unit,
    private val onFinal: (String) -> Unit,
    private val onError: (String) -> Unit
) {
    private var recognizer: SpeechRecognizer? = null

    fun available(): Boolean = SpeechRecognizer.isRecognitionAvailable(ctx)

    /** Intent nhận giọng nói; cũng dùng cho hộp thoại nhận giọng của hệ thống khi cần. */
    fun intent(): Intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "vi-VN")
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "vi-VN")
        .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx.packageName)

    fun start() {
        stop()
        val r = SpeechRecognizer.createSpeechRecognizer(ctx)
        recognizer = r
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}

            override fun onPartialResults(partialResults: Bundle?) {
                first(partialResults)?.let(onPartial)
            }

            override fun onResults(results: Bundle?) {
                val text = first(results)
                if (text == null) onError("Mình chưa nghe rõ, bạn bấm micro để nói lại nhé") else onFinal(text)
            }

            override fun onError(error: Int) {
                onError(
                    when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT ->
                            "Mình chưa nghe rõ, bạn bấm micro để nói lại nhé"
                        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
                            "Không có mạng để nhận giọng nói"
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Chưa có quyền dùng micro"
                        SpeechRecognizer.ERROR_AUDIO -> "Không thu được tiếng từ micro"
                        else -> "Lỗi nhận giọng nói (mã $error)"
                    }
                )
            }
        })
        r.startListening(intent())
    }

    fun stop() {
        recognizer?.let {
            it.cancel()
            it.destroy()
        }
        recognizer = null
    }

    private fun first(bundle: Bundle?): String? =
        bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.takeIf { it.isNotBlank() }
}
