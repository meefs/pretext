import index from "./pages/demo.html"
import benchmark from "./pages/benchmark.html"
import accuracy from "./pages/accuracy.html"
import interleaving from "./pages/interleaving.html"

Bun.serve({
  port: 3000,
  routes: {
    "/": index,
    "/benchmark": benchmark,
    "/accuracy": accuracy,
    "/interleaving": interleaving,
  },
  development: {
    hmr: true,
    console: true,
  },
})

console.log("http://localhost:3000")
