package app.rubikbe

/** Một bước xoay trong lời giải, kèm giai đoạn và lời nhắn cho bé. */
class Step(val move: Int, val stage: Int, val note: String)

/**
 * Cách giải cho người mới, giữ khối với mặt TRẮNG ở dưới, VÀNG ở trên:
 * dấu cộng trắng → góc trắng → tầng giữa → dấu cộng vàng → mặt vàng → góc vàng → cạnh vàng.
 * Mỗi giai đoạn chỉ dùng xoay mặt trên và vài công thức quen thuộc, nên bé học lại được.
 */
object Beginner {
    class Stage(val title: String, val text: String)

    val stages = listOf(
        Stage(
            "Dấu cộng trắng",
            "Đưa 4 cạnh có màu trắng xuống mặt dưới. Màu còn lại của mỗi cạnh phải trùng với ô giữa của mặt bên cạnh."
        ),
        Stage(
            "Bốn góc trắng",
            "Đưa từng góc trắng lên ngay phía trên chỗ của nó, rồi làm công thức vài lần cho tới khi góc vào đúng chỗ."
        ),
        Stage(
            "Tầng giữa",
            "Tìm cạnh ở mặt trên không có màu vàng, xoay mặt trên cho khớp màu, rồi đưa nó vào bên phải hoặc bên trái."
        ),
        Stage("Dấu cộng vàng", "Làm dấu cộng màu vàng ở mặt trên bằng công thức F R U R' U' F'."),
        Stage("Mặt vàng", "Làm cho cả mặt trên thành màu vàng bằng công thức R U R' U R U2 R'."),
        Stage("Đặt đúng 4 góc vàng", "Đổi chỗ các góc ở mặt trên cho tới khi mỗi góc nằm đúng chỗ của mình."),
        Stage("Đặt đúng 4 cạnh vàng", "Bước cuối cùng: đổi chỗ các cạnh ở mặt trên là khối được giải xong!")
    )

    private class Macro(val moves: IntArray, val note: String)
    private class Node(val cube: CubieCube, val parent: Node?, val macro: Macro?, val cost: Int)

    // Vị trí miếng ở mặt dưới / tầng giữa (xem thứ tự trong CubieCube).
    private val D_CORNERS = intArrayOf(4, 5, 6, 7)
    private val D_EDGES = intArrayOf(4, 5, 6, 7)
    private val MID_EDGES = intArrayOf(8, 9, 10, 11)

    private val EDGE_POS = Array(18) { IntArray(12) }
    private val EDGE_FLIP = Array(18) { IntArray(12) }

    init {
        for (m in 0 until 18) {
            val c = Moves.cubes[m]
            for (i in 0 until 12) {
                EDGE_POS[m][c.ep[i]] = i
                EDGE_FLIP[m][c.ep[i]] = c.eo[i]
            }
        }
    }

    private fun setups(note: String) = listOf(
        Macro(intArrayOf(0), note), Macro(intArrayOf(1), note), Macro(intArrayOf(2), note)
    )

    fun solve(start: CubieCube, colorName: (Int) -> String): List<Step> {
        val steps = ArrayList<Step>()
        var cube = start

        fun emit(stage: Int, moves: IntArray, note: String) {
            for (m in moves) steps.add(Step(m, stage, note))
            cube = cube.apply(moves)
        }

        fun emitMacros(stage: Int, prefix: String, macros: List<Macro>) {
            for (mac in macros) emit(stage, mac.moves, prefix + mac.note)
        }

        fun pieceName(faces: IntArray): String = faces.joinToString("–") { colorName(it).lowercase() }

        // 1. Dấu cộng trắng: từng cạnh một, tìm đường ngắn nhất mà không phá cạnh đã xong.
        val crossDone = ArrayList<Int>()
        while (crossDone.size < 4) {
            var bestPath: IntArray? = null
            var bestEdge = -1
            for (e in D_EDGES) {
                if (e in crossDone) continue
                val path = edgeSearch(cube, crossDone + e)
                if (bestPath == null || path.size < bestPath.size) {
                    bestPath = path
                    bestEdge = e
                }
            }
            val edgeName = pieceName(CubieCube.edgeColor[bestEdge])
            emit(0, bestPath!!, "Đưa cạnh $edgeName xuống đúng chỗ ở mặt dưới")
            crossDone.add(bestEdge)
        }

        fun crossOk(c: CubieCube) = D_EDGES.all { c.ep[it] == it && c.eo[it] == 0 }
        fun cornerOk(c: CubieCube, i: Int) = c.cp[i] == i && c.co[i] == 0
        fun edgeOk(c: CubieCube, i: Int) = c.ep[i] == i && c.eo[i] == 0

        // 2. Bốn góc trắng: công thức R U R' U' (nhìn từ góc cần đặt).
        val cornerMacros = ArrayList<Macro>()
        cornerMacros += setups("Xoay mặt trên để đưa góc lên ngay phía trên chỗ của nó")
        for (frame in 0 until 4) {
            val one = Moves.parse("R U R' U'", frame)
            for (rep in 1..5) {
                val seq = IntArray(one.size * rep) { one[it % one.size] }
                val times = if (rep == 1) "" else " (làm $rep lần)"
                cornerMacros += Macro(seq, "Công thức ${Moves.text(one)}$times")
            }
        }
        val cornersDone = ArrayList<Int>()
        while (cornersDone.size < 4) {
            var bestPlan: List<Macro>? = null
            var bestCorner = -1
            for (c in D_CORNERS) {
                if (c in cornersDone) continue
                val need = cornersDone + c
                val plan = macroSearch(cube, cornerMacros, 3) { s -> crossOk(s) && need.all { cornerOk(s, it) } }
                    ?: continue
                if (bestPlan == null || moveCount(plan) < moveCount(bestPlan)) {
                    bestPlan = plan
                    bestCorner = c
                }
            }
            checkNotNull(bestPlan) { "Không tìm được cách đặt góc trắng" }
            val name = pieceName(CubieCube.cornerColor[bestCorner])
            emitMacros(1, "Góc $name: ", bestPlan)
            cornersDone.add(bestCorner)
        }

        // 3. Tầng giữa: đưa cạnh vào bên phải hoặc bên trái.
        fun bottomOk(c: CubieCube) = crossOk(c) && D_CORNERS.all { cornerOk(c, it) }
        val middleMacros = ArrayList<Macro>()
        middleMacros += setups("Xoay mặt trên cho cạnh khớp với màu ô giữa")
        for (frame in 0 until 4) {
            val right = Moves.parse("U R U' R' U' F' U F", frame)
            val left = Moves.parse("U' L' U L U F U' F'", frame)
            middleMacros += Macro(right, "Đưa cạnh vào bên phải: ${Moves.text(right)}")
            middleMacros += Macro(left, "Đưa cạnh vào bên trái: ${Moves.text(left)}")
        }
        val middleDone = ArrayList<Int>()
        while (middleDone.size < 4) {
            var bestPlan: List<Macro>? = null
            var bestEdge = -1
            for (e in MID_EDGES) {
                if (e in middleDone) continue
                val need = middleDone + e
                val plan = macroSearch(cube, middleMacros, 4) { s -> bottomOk(s) && need.all { edgeOk(s, it) } }
                    ?: continue
                if (bestPlan == null || moveCount(plan) < moveCount(bestPlan)) {
                    bestPlan = plan
                    bestEdge = e
                }
            }
            checkNotNull(bestPlan) { "Không tìm được cách đặt cạnh tầng giữa" }
            val name = pieceName(CubieCube.edgeColor[bestEdge])
            emitMacros(2, "Cạnh $name: ", bestPlan)
            middleDone.add(bestEdge)
        }

        fun twoLayersOk(c: CubieCube) = bottomOk(c) && MID_EDGES.all { edgeOk(c, it) }
        val turnTop = setups("Xoay mặt trên để chuẩn bị")

        // 4. Dấu cộng vàng.
        val crossAlg = Macro(Moves.parse("F R U R' U' F'"), "Công thức F R U R' U' F'")
        fun yellowCross(c: CubieCube) = twoLayersOk(c) && (0 until 4).all { c.eo[it] == 0 }
        val p4 = macroSearch(cube, turnTop + crossAlg, 6) { yellowCross(it) }
        checkNotNull(p4) { "Không làm được dấu cộng vàng" }
        emitMacros(3, "", p4)

        // 5. Mặt vàng.
        val sune = Macro(Moves.parse("R U R' U R U2 R'"), "Công thức R U R' U R U2 R'")
        fun yellowFace(c: CubieCube) = yellowCross(c) && (0 until 4).all { c.co[it] == 0 }
        val p5 = macroSearch(cube, turnTop + sune, 8) { yellowFace(it) }
        checkNotNull(p5) { "Không làm được mặt vàng" }
        emitMacros(4, "", p5)

        // 6. Đặt đúng 4 góc vàng.
        val aPerm = Macro(Moves.parse("R' F R' B2 R F' R' B2 R2"), "Công thức đổi góc R' F R' B2 R F' R' B2 R2")
        fun cornersPlaced(c: CubieCube) = yellowFace(c) && (0 until 4).all { c.cp[it] == it }
        val p6 = macroSearch(cube, turnTop + aPerm, 6) { cornersPlaced(it) }
        checkNotNull(p6) { "Không đặt được góc vàng" }
        emitMacros(5, "", p6)

        // 7. Đặt đúng 4 cạnh vàng.
        val uA = Macro(Moves.parse("R U' R U R U R U' R' U' R2"), "Công thức đổi cạnh R U' R U R U R U' R' U' R2")
        val uB = Macro(Moves.parse("R2 U R U R' U' R' U' R' U R'"), "Công thức đổi cạnh R2 U R U R' U' R' U' R' U R'")
        val p7 = macroSearch(cube, turnTop + uA + uB, 6) { it.isSolved() }
        checkNotNull(p7) { "Không đặt được cạnh vàng" }
        emitMacros(6, "", p7)

        check(cube.isSolved()) { "Lời giải không về được khối hoàn chỉnh" }
        return simplify(steps)
    }

    private fun moveCount(plan: List<Macro>) = plan.sumOf { it.moves.size }

    /**
     * Thử mọi cách ghép tối đa [maxDepth] khối lệnh (công thức) và chọn cách đạt [goal]
     * với ít bước xoay nhất.
     */
    private fun macroSearch(
        start: CubieCube, macros: List<Macro>, maxDepth: Int, goal: (CubieCube) -> Boolean
    ): List<Macro>? {
        if (goal(start)) return emptyList()
        val seen = HashMap<String, Int>()
        seen[start.key()] = 0
        var found: Node? = null
        var frontier = listOf(Node(start, null, null, 0))
        for (depth in 1..maxDepth) {
            val next = ArrayList<Node>()
            for (node in frontier) {
                for (mac in macros) {
                    // Hai lần xoay mặt trên liền nhau là thừa.
                    if (mac.moves.size == 1 && node.macro?.moves?.size == 1) continue
                    val cost = node.cost + mac.moves.size
                    if (found != null && cost >= found.cost) continue
                    val c = node.cube.apply(mac.moves)
                    val key = c.key()
                    val prev = seen[key]
                    if (prev != null && prev <= cost) continue
                    seen[key] = cost
                    val n = Node(c, node, mac, cost)
                    if (goal(c)) found = n else next.add(n)
                }
            }
            frontier = next
        }
        val path = ArrayList<Macro>()
        var p: Node? = found ?: return null
        while (p?.macro != null) {
            path.add(p.macro!!)
            p = p.parent
        }
        return path.reversed()
    }

    /** Đường ngắn nhất để các cạnh [tracked] về đúng chỗ (chỉ theo dõi các cạnh đó). */
    private fun edgeSearch(cube: CubieCube, tracked: List<Int>): IntArray {
        val n = tracked.size
        var size = 1
        repeat(n) { size *= 24 }
        fun encode(states: IntArray): Int {
            var key = 0
            for (k in n - 1 downTo 0) key = key * 24 + states[k]
            return key
        }
        val startStates = IntArray(n) { k ->
            val pos = cube.ep.indexOf(tracked[k])
            pos * 2 + cube.eo[pos]
        }
        val start = encode(startStates)
        val goal = encode(IntArray(n) { tracked[it] * 2 })
        if (start == goal) return IntArray(0)
        val parent = IntArray(size) { -1 }
        val via = ByteArray(size)
        val queue = IntArray(size)
        var head = 0
        var tail = 0
        parent[start] = start
        queue[tail++] = start
        val states = IntArray(n)
        while (head < tail) {
            val key = queue[head++]
            var rest = key
            for (k in 0 until n) {
                states[k] = rest % 24
                rest /= 24
            }
            for (m in 0 until 18) {
                var nk = 0
                for (k in n - 1 downTo 0) {
                    val p = states[k] / 2
                    val o = states[k] % 2
                    nk = nk * 24 + EDGE_POS[m][p] * 2 + (o xor EDGE_FLIP[m][p])
                }
                if (parent[nk] != -1) continue
                parent[nk] = key
                via[nk] = m.toByte()
                if (nk == goal) {
                    val path = ArrayList<Int>()
                    var cur = nk
                    while (cur != start) {
                        path.add(via[cur].toInt())
                        cur = parent[cur]
                    }
                    return path.reversed().toIntArray()
                }
                queue[tail++] = nk
            }
        }
        error("Không tìm được đường cho cạnh trắng")
    }

    /**
     * Gộp hai lần xoay cùng một mặt liền nhau (U rồi U thành U2...), nhưng chỉ trong cùng
     * một lời nhắn, để công thức bé đang học vẫn giữ nguyên.
     */
    fun simplify(steps: List<Step>): List<Step> {
        val out = ArrayList<Step>()
        for (s in steps) {
            val last = out.lastOrNull()
            if (last != null && last.note == s.note && last.move / 3 == s.move / 3) {
                val turns = ((last.move % 3 + 1) + (s.move % 3 + 1)) % 4
                out.removeAt(out.size - 1)
                if (turns != 0) out.add(Step(s.move / 3 * 3 + turns - 1, s.stage, s.note))
            } else {
                out.add(s)
            }
        }
        return out
    }
}
