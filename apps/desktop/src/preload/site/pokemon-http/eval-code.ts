import { globalRendererPathParser } from "@/global/global-renderer-path-parser";
import fs from 'fs';

export function evalCode() {
    const srcList = [
        globalRendererPathParser.resolveAppRoot('recapcha-enterprise.js').toString(),
        globalRendererPathParser.resolveAppRoot('gigya.js').toString(),
    ]
    const remoteScriptList = [
        '/larkbileomet.js?single',
    ]
    srcList.forEach(src => {
        const script = document.createElement('script');
        const code = fs.readFileSync(src, 'utf-8');
        script.textContent = code;
        document.head.appendChild(script);
    });
    remoteScriptList.forEach(link => {
        const script = document.createElement('script');
        script.src = link;
        script.crossOrigin = 'anonymous';
        document.head.appendChild(script);
    });
}
