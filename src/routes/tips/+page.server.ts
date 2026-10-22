import type { PageServerLoad, Actions } from "./$types";
import source from "../../../content/tips.md?raw";
import { markdown } from "#lib/markdown.js";
export const load = () => ({ html: markdown(source) });
