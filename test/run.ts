import { summary } from "./harness";
import { run as lighting } from "./lighting.test";
import { run as mesher } from "./mesher.test";
import { run as world } from "./world.test";
import { run as worldgen } from "./worldgen.test";

worldgen();
mesher();
world();
lighting();
summary();
