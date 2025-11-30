export type {FingerPrintGenerator} from "./FingerPrintGenerator";

declare global{
  interface Navigator {
    userAgentData: NavigatorUAData;
  }
}
