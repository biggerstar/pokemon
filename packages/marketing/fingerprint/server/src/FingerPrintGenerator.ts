import { genRandomUseragent } from "./generator";
import type { Filter, UserAgentData } from "./typing";

type FingerPrintGeneratorOptions = {
  userAgent?: string;
  webgl?: boolean;
  language?: string;
  languages?: string[];
  hardwareConcurrency?: number;
}

const DEFAULT_LANGUAGE = 'en'
// const DEFAULT_LANGUAGE = 'en-US'

const defaultOptions: Required<FingerPrintGeneratorOptions> = {
  language: DEFAULT_LANGUAGE,
  languages: [DEFAULT_LANGUAGE],
  hardwareConcurrency: 16,
  userAgent: '',
  webgl: false,
}

export class FingerPrintGenerator {
  public readonly userAgent: string;
  public readonly userAgentData: UserAgentData;
  public readonly webgl: boolean;
  public readonly language: string;
  public readonly languages: string[];
  public readonly hardwareConcurrency: number;

  constructor(options: FingerPrintGeneratorOptions = {}) {
    const filterOptions: Filter = {
      deviceCategory: 'desktop',
      vendor: 'Google Inc.',
    }
    if (options.userAgent) {
      filterOptions.userAgent = options.userAgent
    }
    this.userAgentData = genRandomUseragent(filterOptions);
    this.userAgent = options.userAgent || this.userAgentData.userAgent
    this.webgl = options.webgl || defaultOptions.webgl
    this.language = options.language || defaultOptions.language
    this.languages = options.languages || defaultOptions.languages
    this.hardwareConcurrency = options.hardwareConcurrency || defaultOptions.hardwareConcurrency
  }
}
