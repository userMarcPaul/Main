/* Run the scheduled maintenance by hand: `npm run cleanup`. */
import { cleanup } from "../lib/services/maintenance.js";
console.log(await cleanup());
