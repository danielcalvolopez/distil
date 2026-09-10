#!/usr/bin/env node
import { main } from "../dist/cli.js";
main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
