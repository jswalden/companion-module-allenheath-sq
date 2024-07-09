import type { CompanionOptionValues, DropdownChoice } from '@companion-module/base'
import { type SQInstanceInterface as sqInstance } from '../instance-interface.js'

/**
 * Action IDs for all actions that alter the level of a mixer source in a mixer
 * sink.
 */
export enum LevelActionId {
	InputChannelLevelInMixOrLR = 'chlev_to_mix',
	GroupLevelInMixOrLR = 'grplev_to_mix',
	FXReturnLevelInMixOrLR = 'fxrlev_to_mix',
	FXReturnLevelInGroup = 'fxrlev_to_grp',
	InputChannelLevelInFXSend = 'chlev_to_fxs',
	GroupLevelInFXSend = 'grplev_to_fxs',
	// The "fxslev" typo in the next line is in fact correct until it can be
	// corrected in an upgrade script.
	FXReturnLevelInFXSend = 'fxslev_to_fxs',
	MixOrLRLevelInMatrix = 'mixlev_to_mtx',
	GroupLevelInMatrix = 'grplev_to_mtx',
}

/** Compute the set of level options for level-setting actions. */
export function createLevels(): DropdownChoice[] {
	const levels: DropdownChoice[] = []
	levels.push(
		{ label: `Last dB value`, id: 1000 },
		{ label: `Step +0.1 dB`, id: 'step+0.1' }, //added
		{ label: `Step +1 dB`, id: 'step+1' },
		{ label: `Step +3 dB`, id: 'step+3' }, //added
		{ label: `Step +6 dB`, id: 'step+6' }, //added
		{ label: `Step -0.1 dB`, id: 'step-0.1' }, //added
		{ label: `Step -1 dB`, id: 'step-1' },
		{ label: `Step -3 dB`, id: 'step-3' }, //added
		{ label: `Step -6 dB`, id: 'step-6' }, //added
	)
	for (let i = -90; i <= -40; i = i + 5) {
		const id = i == -90 ? '-inf' : i
		levels.push({ label: `${i} dB`, id })
	}
	for (let i = -39; i <= -10; i = i + 1) {
		levels.push({ label: `${i} dB`, id: i })
	}
	for (let i = -9.5; i <= 10; i = i + 0.5) {
		levels.push({ label: `${i} dB`, id: i })
	}
	return levels
}

/**
 * Given options for a fade-to-level action, compute the time the fade should
 * take.  On failure log an error and return null, otherwise return the fade
 * time, in seconds.
 */
export function getFadeTimeSeconds(instance: sqInstance, options: CompanionOptionValues): number | null {
	const fadeSeconds = Number(options.fade)
	if (fadeSeconds >= 0) {
		return fadeSeconds
	}

	instance.log('error', `Bad fade time ${fadeSeconds} seconds, aborting`)
	return null
}
