package app.rubikbe

import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import kotlin.math.max
import kotlin.math.min

/**
 * Bộ giải "hai pha" của Kociemba (bản không dùng đối xứng):
 * pha 1 đưa khối vào nhóm chỉ cần U, D, R2, L2, F2, B2; pha 2 giải nốt trong nhóm đó.
 * Thường cho lời giải khoảng 20–23 bước trong chưa tới một giây.
 */
object TwoPhase {
    private const val N_TWIST = 2187
    private const val N_FLIP = 2048
    private const val N_SLICE = 495
    private const val N_PERM = 40320
    private const val N_SPERM = 24
    private const val SLICE_SOLVED = 494
    private const val CACHE_MAGIC = 0x52424B31 // "RBK1"

    private val ALL_MOVES = IntArray(18) { it }
    private val P2_MOVES = intArrayOf(0, 1, 2, 9, 10, 11, 4, 7, 13, 16)
    private val isP2 = BooleanArray(18).also { for (m in P2_MOVES) it[m] = true }

    private lateinit var twistMove: IntArray
    private lateinit var flipMove: IntArray
    private lateinit var sliceMove: IntArray
    private lateinit var cpMove: IntArray
    private lateinit var udMove: IntArray
    private lateinit var spMove: IntArray
    private lateinit var pTwistSlice: ByteArray
    private lateinit var pFlipSlice: ByteArray
    private lateinit var pCornSP: ByteArray
    private lateinit var pEdgeSP: ByteArray

    @Volatile
    var ready = false
        private set
    private val lock = Any()

    /** Dựng bảng tra (lần đầu mất vài giây; lần sau đọc lại từ [cache] nếu có). */
    fun prepare(cache: File?) {
        if (ready) return
        synchronized(lock) {
            if (ready) return
            twistMove = moveTable(N_TWIST, ALL_MOVES) { it.twist() }
            flipMove = moveTable(N_FLIP, ALL_MOVES) { it.flip() }
            sliceMove = moveTable(N_SLICE, ALL_MOVES) { it.slice() }
            cpMove = moveTable(N_PERM, P2_MOVES) { it.cornerPerm() }
            udMove = moveTable(N_PERM, P2_MOVES) { it.udEdgePerm() }
            spMove = moveTable(N_SPERM, P2_MOVES) { it.slicePerm() }
            if (!load(cache)) {
                pTwistSlice = prune(N_TWIST, N_SLICE, twistMove, sliceMove, ALL_MOVES, 0, SLICE_SOLVED)
                pFlipSlice = prune(N_FLIP, N_SLICE, flipMove, sliceMove, ALL_MOVES, 0, SLICE_SOLVED)
                pCornSP = prune(N_PERM, N_SPERM, cpMove, spMove, P2_MOVES, 0, 0)
                pEdgeSP = prune(N_PERM, N_SPERM, udMove, spMove, P2_MOVES, 0, 0)
                save(cache)
            }
            ready = true
        }
    }

    /** Lập bảng toạ độ sau mỗi bước xoay bằng cách đi loang từ khối đã giải. */
    private fun moveTable(n: Int, moves: IntArray, coord: (CubieCube) -> Int): IntArray {
        val table = IntArray(n * 18) { -1 }
        val seen = BooleanArray(n)
        val queue = ArrayDeque<CubieCube>()
        val start = CubieCube()
        seen[coord(start)] = true
        queue.add(start)
        while (queue.isNotEmpty()) {
            val c = queue.removeFirst()
            val cc = coord(c)
            for (m in moves) {
                val next = c.move(m)
                val k = coord(next)
                table[cc * 18 + m] = k
                if (!seen[k]) {
                    seen[k] = true
                    queue.add(next)
                }
            }
        }
        return table
    }

    /** Bảng khoảng cách tối thiểu tới đích cho cặp toạ độ (a, b). */
    private fun prune(
        n1: Int, n2: Int, move1: IntArray, move2: IntArray, moves: IntArray, start1: Int, start2: Int
    ): ByteArray {
        val size = n1 * n2
        val t = ByteArray(size) { -1 }
        val queue = IntArray(size)
        var head = 0
        var tail = 0
        val s = start1 * n2 + start2
        t[s] = 0
        queue[tail++] = s
        while (head < tail) {
            val idx = queue[head++]
            val a = idx / n2
            val b = idx % n2
            val d = (t[idx] + 1).toByte()
            for (m in moves) {
                val ni = move1[a * 18 + m] * n2 + move2[b * 18 + m]
                if (t[ni].toInt() == -1) {
                    t[ni] = d
                    queue[tail++] = ni
                }
            }
        }
        return t
    }

    private fun load(file: File?): Boolean {
        if (file == null || !file.exists()) return false
        return try {
            DataInputStream(file.inputStream().buffered()).use { input ->
                if (input.readInt() != CACHE_MAGIC) return false
                val a = ByteArray(N_TWIST * N_SLICE)
                val b = ByteArray(N_FLIP * N_SLICE)
                val c = ByteArray(N_PERM * N_SPERM)
                val d = ByteArray(N_PERM * N_SPERM)
                input.readFully(a)
                input.readFully(b)
                input.readFully(c)
                input.readFully(d)
                pTwistSlice = a
                pFlipSlice = b
                pCornSP = c
                pEdgeSP = d
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun save(file: File?) {
        if (file == null) return
        try {
            val tmp = File(file.path + ".tmp")
            DataOutputStream(tmp.outputStream().buffered()).use { out ->
                out.writeInt(CACHE_MAGIC)
                out.write(pTwistSlice)
                out.write(pFlipSlice)
                out.write(pCornSP)
                out.write(pEdgeSP)
            }
            tmp.renameTo(file)
        } catch (e: Exception) {
            // Không lưu được thì lần sau dựng lại, không sao.
        }
    }

    // ----- Tìm kiếm -----

    private val m1 = IntArray(32)
    private val m2 = IntArray(32)
    private var best: IntArray? = null
    private var bestLen = 0
    private var deadline = 0L
    private var target = 0
    private var stop = false
    private var nodes = 0L
    private lateinit var root: CubieCube

    /**
     * Trả về dãy bước giải. Dừng khi có lời giải ≤ [goodEnough] bước,
     * hoặc khi hết [timeMs] mà đã có lời giải.
     */
    fun solve(cube: CubieCube, timeMs: Long = 2500, goodEnough: Int = 21): IntArray? = synchronized(lock) {
        check(ready) { "Chưa dựng bảng tra" }
        if (cube.isSolved()) return@synchronized IntArray(0)
        root = cube
        best = null
        bestLen = 31
        target = goodEnough
        stop = false
        deadline = System.currentTimeMillis() + timeMs
        val tw = cube.twist()
        val fl = cube.flip()
        val sl = cube.slice()
        for (d1 in h1(tw, fl, sl)..20) {
            if (d1 >= bestLen) break
            search1(tw, fl, sl, 0, d1, -1)
            if (stop) break
            if (best != null && System.currentTimeMillis() > deadline) break
        }
        best
    }

    private fun prune(v: Byte): Int = if (v < 0) 20 else v.toInt()

    private fun h1(t: Int, f: Int, s: Int): Int =
        max(prune(pTwistSlice[t * N_SLICE + s]), prune(pFlipSlice[f * N_SLICE + s]))

    private fun h2(c: Int, u: Int, s: Int): Int =
        max(prune(pCornSP[c * N_SPERM + s]), prune(pEdgeSP[u * N_SPERM + s]))

    private fun search1(t: Int, f: Int, s: Int, depth: Int, togo: Int, lastFace: Int) {
        if (togo == 0) {
            if (t == 0 && f == 0 && s == SLICE_SOLVED) {
                // Bước cuối của pha 1 là bước của pha 2 thì đã có lời giải ngắn hơn trước đó.
                if (depth > 0 && isP2[m1[depth - 1]]) return
                phase2(depth)
            }
            return
        }
        if ((++nodes and 0x3FF) == 0L && best != null && System.currentTimeMillis() > deadline) {
            stop = true
            return
        }
        for (m in 0 until 18) {
            val face = m / 3
            if (face == lastFace || face == lastFace - 3) continue
            val nt = twistMove[t * 18 + m]
            val nf = flipMove[f * 18 + m]
            val ns = sliceMove[s * 18 + m]
            if (h1(nt, nf, ns) >= togo) continue
            m1[depth] = m
            search1(nt, nf, ns, depth + 1, togo - 1, face)
            if (stop) return
        }
    }

    private fun phase2(d1: Int) {
        var c = root
        for (i in 0 until d1) c = c.move(m1[i])
        val cp = c.cornerPerm()
        val ud = c.udEdgePerm()
        val sp = c.slicePerm()
        val limit = min(bestLen - 1 - d1, 18)
        if (limit < 0) return
        val last = if (d1 > 0) m1[d1 - 1] / 3 else -1
        for (d2 in h2(cp, ud, sp)..limit) {
            if (search2(cp, ud, sp, 0, d2, last)) {
                val sol = IntArray(d1 + d2)
                for (i in 0 until d1) sol[i] = m1[i]
                for (i in 0 until d2) sol[d1 + i] = m2[i]
                best = sol
                bestLen = sol.size
                if (bestLen <= target) stop = true
                return
            }
        }
    }

    private fun search2(c: Int, u: Int, s: Int, depth: Int, togo: Int, lastFace: Int): Boolean {
        if (togo == 0) return c == 0 && u == 0 && s == 0
        for (m in P2_MOVES) {
            val face = m / 3
            if (face == lastFace || face == lastFace - 3) continue
            val nc = cpMove[c * 18 + m]
            val nu = udMove[u * 18 + m]
            val ns = spMove[s * 18 + m]
            if (h2(nc, nu, ns) >= togo) continue
            m2[depth] = m
            if (search2(nc, nu, ns, depth + 1, togo - 1, face)) return true
        }
        return false
    }
}
