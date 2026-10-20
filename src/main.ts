import { TESTS } from "./app/registry";
import { startRouter } from "./app/router";
import "@fontsource-variable/golos-text/index.css";
import "./styles/base.css";

startRouter(document.getElementById("app")!, TESTS);
