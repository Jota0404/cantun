import { BandStageService } from './bandStageService'

/**
 * Target-domain facade for live Stage execution.
 * The underlying realtime/runtime bridge remains legacy-compatible by design.
 */
export class StageExecutionService extends BandStageService {}
