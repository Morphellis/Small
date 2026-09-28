import { TESTS } from "./app/registry";
import { startRouter } from "./app/router";
import "./styles/base.css";

startRouter(document.getElementById("app")!, TESTS);
