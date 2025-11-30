import { toFinallyObject } from "./utils/other.print";

export async function testFinngerPrint() {
  const userAgentData: Record<any, any> = navigator.userAgentData
  console.log('userAgentData', toFinallyObject(navigator.userAgentData));
  console.log('navigator', toFinallyObject(navigator));
  console.log('toJSON', userAgentData?.toJSON());

  const highEntropyValues = await userAgentData?.getHighEntropyValues?.([
    "brands",
    "mobile",
    "platform",
    "platformVersion",
    "architecture",
    "bitness",
    "wow64",
    "model",
    "uaFullVersion",
    "fullVersionList",
    "formFactors"
  ])
  console.log('highEntropyValues', highEntropyValues);
}
