import { bindProgressTransfer } from "./app/progressTransfer";
import { TESTS } from "./app/registry";
import { startRouter } from "./app/router";
import "./styles/base.css";

startRouter(document.getElementById("app")!, TESTS);
bindProgressTransfer(document.querySelector(".site-footer")!, TESTS);
