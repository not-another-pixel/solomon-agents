import dotenv from "dotenv";
import { analyzeVideoFromGCS } from "./lib/dal/gcp/analyse_video";

dotenv.config();

const analysis = await analyzeVideoFromGCS('facebook-ads-media-sources', 'LWzhyIjb1qnUJe0N6Fi3/120236257010250295');

console.log('Video Analysis Result:', analysis);