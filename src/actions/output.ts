import type {
	CompanionInputFieldDropdown,
	CompanionMigrationAction,
	CompanionOptionValues,
} from '@companion-module/base'
import type { ActionDefinitions } from './actionid.js'
import type { Choices } from '../choices.js'
import { getFadeParameters } from './fading.js'
import type { sqInstance } from '../instance.js'
import type { Mixer } from '../mixer/mixer.js'
import type { InputOutputType, Model } from '../mixer/model.js'
import { getCommonCount } from '../mixer/models.js'
import type { Param } from '../mixer/nrpn/param.js'
import {
	SinkLevelInOutputBase,
	type SinkLevelInOutputType,
	type SinkPanBalanceInOutputType,
	SinkPanBalanceInOutputBase,
	computeParameters,
} from '../mixer/parameters.js'
import { getPanBalance, type PanBalanceChoice } from './pan-balance.js'
import { toSourceOrSink } from './to-source-or-sink.js'

/** Action IDs for all actions affecting sinks used as direct mixer outputs. */
export enum OutputActionId {
	LRLevelOutput = 'lr_level_output',
	MixLevelOutput = 'mix_level_output',
	FXSendLevelOutput = 'fxsend_level_output',
	MatrixLevelOutput = 'matrix_level_output',
	DCALevelOutput = 'dca_level_output',
	LRPanBalanceOutput = 'lr_panbalance_output',
	MixPanBalanceOutput = 'mix_panbalance_output',
	MatrixPanBalanceOutput = 'matrix_panbalance_output',
}

/**
 * The action ID of the obsolete "Fader level to output" action, used to alter
 * the level of sinks of all types when assigned to a physical mixer output.
 */
export const ObsoleteLevelToOutputId = 'level_to_output'

/**
 * The action ID of the obsolete "Pan/Bal level to output" action, used to alter
 * the pan/balance of sinks of all types when assigned to physical mixer
 * outputs.
 */
export const ObsoletePanToOutputId = 'pan_to_output'

/**
 * Adjusting the level of various mixer sinks that can be assigned to physical
 * mixer outputs used to be done in one "Fader level to output" action.  One of
 * its options was a laundry list of all sinks (LR/mix/FX send/matrix/DCA) that
 * could be assigned to physical mixer outputs.  Each option value corresponded
 * exactly to the necessary offset from an NRPN base for all level-output NRPNs.
 * This meshed with internal fading logic but introduced a conceptual hurdle --
 * and prevented sensibly exposing output-level-modifying functionality in
 * `Mixer` without replicating the peculiar NRPN calculations.
 *
 * For clarity, and to reduce this NRPN encoding dependence, this action was
 * split into one action per sink category: separate "LR fader level to output",
 * "Mix fader level to output", &c. actions.  Each action identifies its sink
 * the normal way sources and sinks are identified, i.e. with a number in
 * `[0, sinkCount)` for sinks 1 to N.
 *
 * This function rewrites any old-style "level to output" actions to new,
 * sink-type-specific actions.
 */
export function tryConvertOldLevelToOutputActionToSinkSpecific(action: CompanionMigrationAction): boolean {
	if (action.actionId !== ObsoleteLevelToOutputId) {
		return false
	}

	const mixCount = getCommonCount('mixCount')
	const fxsCount = getCommonCount('fxsCount')
	const mtxCount = getCommonCount('mtxCount')
	const dcaCount = getCommonCount('dcaCount')

	// Old output level action options:
	//
	// options: [
	//      {
	//              type: 'dropdown',
	//              label: 'Fader',
	//              id: 'input',
	//              default: 0,
	//              choices: choices.allFaders,
	//              minChoicesForSearch: 0,
	//      },
	//      ...
	// ],
	//
	// Old output level fader options:
	//
	// // All fader mix choices
	// const allFaders: DropdownChoice[] = []
	// allFaders.push({ label: `LR`, id: 0 })
	// model.forEachMix((mix, mixLabel) => {
	//      allFaders.push({ label: mixLabel, id: mix + 1 })
	// })
	// model.forEachFxSend((fxs, fxsLabel) => {
	//      allFaders.push({ label: fxsLabel, id: fxs + 1 + model.count.mix })
	// })
	// model.forEachMatrix((matrix, matrixLabel) => {
	//      allFaders.push({ label: matrixLabel, id: matrix + 1 + model.count.mix + model.count.fxSend })
	// })
	// model.forEachDCA((dca, dcaLabel) => {
	//      allFaders.push({
	//              label: dcaLabel,
	//              id: dca + 1 + model.count.mix + model.count.fxSend + model.count.matrix + 12,
	//      })
	// })
	// return allFaders
	const options = action.options
	const input = Number(options.input)
	let newInput, newActionId
	if (input < 0) {
		// No valid inputs below zero.  Do nothing so an invalid option is
		// retained as-is.
		return false
	} else if (input < 1) {
		// LR is 0.
		// The new action doesn't include an input property because there's only
		// one LR.
		delete options.input
		action.actionId = OutputActionId.LRLevelOutput
		return true
	} else if (input < 1 + mixCount) {
		// Mix is [0x1, 0x1 + 12).
		newInput = input - 1
		newActionId = OutputActionId.MixLevelOutput
	} else if (input < 1 + mixCount + fxsCount) {
		// FX send is [0xd, 0xd + 4).
		newInput = input - (1 + mixCount)
		newActionId = OutputActionId.FXSendLevelOutput
	} else if (input < 1 + mixCount + fxsCount + mtxCount) {
		// Matrix is [0x11, 0x11 + 3).
		newInput = input - (1 + mixCount + fxsCount)
		newActionId = OutputActionId.MatrixLevelOutput
	} else if (input < 1 + mixCount + fxsCount + mtxCount + 12) {
		// This 12-element gap in the NRPN table doesn't encode anything.  Do
		// nothing so an invalid option is retained as-is.
		return false
	} else if (input < 1 + mixCount + fxsCount + mtxCount + 12 + dcaCount) {
		// DCA is [0x20, 0x20 + 8).
		newInput = input - (1 + mixCount + fxsCount + mtxCount + 12)
		newActionId = OutputActionId.DCALevelOutput
	} else {
		// All other numbers are invalid encodings.  Do nothing so an invalid
		// option is retained as-is.
		return false
	}

	options.input = newInput
	action.actionId = newActionId
	return true
}

/**
 * Adjusting the pan/balance of various mixer sinks that can be assigned to
 * physical mixer outputs used to be done in one "Fader Pan/Bal level to output"
 * action.  One of its options was a laundry list of all sinks
 * (LR/mix/FX send/matrix/DCA) that could be assigned to physical mixer outputs.
 * Each option value corresponded exactly to the necessary offset from an NRPN
 * base for all pan/balance-output NRPNs.  This meshed with internal fading
 * logic but introduced a conceptual hurdle -- and prevented sensibly exposing
 * pan/balance-output-modifying functionality in `Mixer` without replicating the
 * peculiar NRPN calculations.
 *
 * For clarity, and to reduce this NRPN encoding dependence, this action was
 * split into one action per sink category: separate "LR Pan/Bal to output",
 * "Mix Pan/Bal to output", &c. actions.  Each action identifies its sink the
 * normal way sources and sinks are identified, i.e. with a number in
 * `[0, sinkCount)` for sinks 1 to N.
 *
 * This function rewrites actions that are old-style "pan/balance to output"
 * actions to new, sink-type-specific actions.
 */
export function tryConvertOldPanToOutputActionToSinkSpecific(action: CompanionMigrationAction): boolean {
	if (action.actionId !== ObsoletePanToOutputId) {
		return false
	}

	const mixCount = getCommonCount('mixCount')
	const mtxCount = getCommonCount('mtxCount')

	// Old output pan/balance action options:
	//
	// options: [
	//      {
	//              type: 'dropdown',
	//              label: 'Fader',
	//              id: 'input',
	//              default: 0,
	//              choices: choices.panBalanceFaders,
	//              minChoicesForSearch: 0,
	//      },
	//      ...
	// ],
	//
	// Old output pan/balance fader options:
	//
	// const allFaders: DropdownChoice[] = []
	// allFaders.push({ label: `LR`, id: 0 })
	// model.forEachMix((mix, mixLabel) => {
	//      allFaders.push({ label: mixLabel, id: 1 + mix })
	// })
	// model.forEachMatrix((matrix, matrixLabel) => {
	//      allFaders.push({ label: matrixLabel, id: 0x11 + matrix })
	// })
	//
	// return allFaders
	const { options } = action
	const input = Number(options.input)
	let newInput, newActionId
	if (input < 0) {
		// No valid inputs below zero.  Leave the action un-mutated in invalid
		// state.
		return false
	} else if (input < 1) {
		// LR is 0.
		// The new action doesn't include an input property because there's only
		// one LR.
		delete options.input
		action.actionId = OutputActionId.LRPanBalanceOutput
		return true
	} else if (input < 1 + mixCount) {
		// Mix is [1, 1 + 12).
		newInput = input - 1
		newActionId = OutputActionId.MixPanBalanceOutput
	} else if (input < 1 + mixCount + 4) {
		// No valid inputs from [13, 17).  Again leave alone.
		return false
	} else if (input < 1 + mixCount + 4 + mtxCount) {
		// Matrix is [17, 17 + 3).
		newInput = input - (1 + mixCount + 4)
		newActionId = OutputActionId.MatrixPanBalanceOutput
	} else {
		// All other numbers are invalid encodings.  Again do nothing.
		return false
	}

	options.input = newInput
	action.actionId = newActionId
	return true
}

/**
 * Get the number of the specified fader from options for a fading action.
 *
 * @param instance
 *   The instance in use.
 * @param model
 *   The model of the mixer.
 * @param options
 *   Options specified for the action.
 * @param type
 *   The type of the fader.
 */
function getFader(
	instance: sqInstance,
	model: Model,
	options: CompanionOptionValues,
	type: InputOutputType,
): number | null {
	return toSourceOrSink(instance, model, options.input, type)
}

type FadeLevelInfo = {
	sink: number
	param: Param
}

function getLevelType(
	instance: sqInstance,
	model: Model,
	options: CompanionOptionValues,
	sinkType: SinkLevelInOutputType,
): FadeLevelInfo | null {
	const sink = toSourceOrSink(instance, model, options.input, sinkType)
	if (sink === null) {
		return null
	}

	return {
		sink,
		param: SinkLevelInOutputBase[sinkType],
	}
}

type PanBalanceInfo = {
	fader: number
	panBalanceChoice: PanBalanceChoice
}

function getPanBalanceType(
	instance: sqInstance,
	model: Model,
	options: CompanionOptionValues,
	type: SinkPanBalanceInOutputType,
): PanBalanceInfo | null {
	const fader = getFader(instance, model, options, type)
	if (fader === null) {
		return null
	}

	const panBalanceChoice = getPanBalance(instance, options)
	if (panBalanceChoice === null) {
		return null
	}

	return {
		fader,
		panBalanceChoice,
	}
}

/**
 * Generate action definitions for adjusting the levels or pan/balance of
 * various mixer sinks when they're assigned to mixer outputs.
 *
 * @param instance
 *   The instance for which actions are being generated.
 * @param mixer
 *   The mixer object to use when executing the actions.
 * @param choices
 *   Option choices for use in the actions.
 * @param levelOption
 *   An action option specifying all levels an output can be set to.
 * @param fadingOption
 *   An action option specifying various fade times over which the set to level
 *   should take place.
 * @param panLevelOption
 *   An action option specifying pan amounts for the output.
 * @returns
 *   The set of all output-adjustment action definitions.
 */
export function outputActions(
	instance: sqInstance,
	mixer: Mixer,
	choices: Choices,
	levelOption: CompanionInputFieldDropdown,
	fadingOption: CompanionInputFieldDropdown,
	panLevelOption: CompanionInputFieldDropdown,
): ActionDefinitions<OutputActionId> {
	const model = mixer.model

	const ShowVar = {
		type: 'textinput',
		label: 'Instance variable containing pan/balance level (click Learn to refresh)',
		id: 'showvar',
		default: '',
	} as const

	return {
		[OutputActionId.LRLevelOutput]: {
			name: 'LR fader level to output',
			options: [
				// There's only one LR, so don't include an input option.
				levelOption,
				fadingOption,
			],
			callback: async ({ options }) => {
				const param = SinkLevelInOutputBase['lr']
				const fade = getFadeParameters(instance, options, param)
				if (fade === null) {
					return
				}
				const { start, end, fadeTimeMs } = fade

				mixer.fadeLROutputLevel(start, end, fadeTimeMs)
			},
		},

		[OutputActionId.MixLevelOutput]: {
			name: 'Mix fader level to output',
			options: [
				{
					type: 'dropdown',
					label: 'Fader',
					id: 'input',
					default: 0,
					choices: choices.mixes,
					minChoicesForSearch: 0,
				},
				levelOption,
				fadingOption,
			],
			callback: async ({ options }) => {
				const levelType = getLevelType(instance, model, options, 'mix')
				if (levelType === null) {
					return
				}
				const { sink: mix, param } = levelType

				const fade = getFadeParameters(instance, options, param)
				if (fade === null) {
					return
				}
				const { start, end, fadeTimeMs } = fade

				mixer.fadeMixOutputLevel(mix, start, end, fadeTimeMs)
			},
		},

		[OutputActionId.FXSendLevelOutput]: {
			name: 'FX Send fader level to output',
			options: [
				{
					type: 'dropdown',
					label: 'Fader',
					id: 'input',
					default: 0,
					choices: choices.fxSends,
					minChoicesForSearch: 0,
				},
				levelOption,
				fadingOption,
			],
			callback: async ({ options }) => {
				const levelType = getLevelType(instance, model, options, 'fxSend')
				if (levelType === null) {
					return
				}
				const { sink: fxSend, param } = levelType

				const fade = getFadeParameters(instance, options, param)
				if (fade === null) {
					return
				}
				const { start, end, fadeTimeMs } = fade

				mixer.fadeFXSendOutputLevel(fxSend, start, end, fadeTimeMs)
			},
		},

		[OutputActionId.MatrixLevelOutput]: {
			name: 'Matrix fader level to output',
			options: [
				{
					type: 'dropdown',
					label: 'Fader',
					id: 'input',
					default: 0,
					choices: choices.matrixes,
					minChoicesForSearch: 0,
				},
				levelOption,
				fadingOption,
			],
			callback: async ({ options }) => {
				const levelType = getLevelType(instance, model, options, 'matrix')
				if (levelType === null) {
					return
				}
				const { sink: matrix, param } = levelType

				const fade = getFadeParameters(instance, options, param)
				if (fade === null) {
					return
				}
				const { start, end, fadeTimeMs } = fade

				mixer.fadeMatrixOutputLevel(matrix, start, end, fadeTimeMs)
			},
		},

		[OutputActionId.DCALevelOutput]: {
			name: 'DCA fader level to output',
			options: [
				{
					type: 'dropdown',
					label: 'Fader',
					id: 'input',
					default: 0,
					choices: choices.dcas,
					minChoicesForSearch: 0,
				},
				levelOption,
				fadingOption,
			],
			callback: async ({ options }) => {
				const levelType = getLevelType(instance, model, options, 'dca')
				if (levelType === null) {
					return
				}
				const { sink: dca, param } = levelType

				const fade = getFadeParameters(instance, options, param)
				if (fade === null) {
					return
				}
				const { start, end, fadeTimeMs } = fade

				mixer.fadeDCAOutputLevel(dca, start, end, fadeTimeMs)
			},
		},

		[OutputActionId.LRPanBalanceOutput]: {
			name: 'LR Pan/Bal to output',
			options: [
				// There's only one LR, so don't include a fader option.
				panLevelOption,
				ShowVar,
			],
			learn: async ({ options }) => {
				const { MSB, LSB } = SinkPanBalanceInOutputBase['lr']

				return {
					...options,
					showvar: `$(${instance.label}:pan_${MSB}.${LSB})`,
				}
			},
			subscribe: async (_action) => {
				const { MSB, LSB } = SinkPanBalanceInOutputBase['lr']

				// Send a "get" so the pan/balance variable is defined.
				void mixer.midi.sendCommands([mixer.getNRPNValue(MSB, LSB)])
			},
			callback: async ({ options }) => {
				const panBalanceChoice = getPanBalance(instance, options)
				if (panBalanceChoice === null) {
					return
				}

				mixer.setLROutputPanBalance(panBalanceChoice)
			},
		},

		[OutputActionId.MixPanBalanceOutput]: {
			name: 'Mix Pan/Bal to output',
			options: [
				{
					type: 'dropdown',
					label: 'Fader',
					id: 'input',
					default: 0,
					choices: choices.mixes,
					minChoicesForSearch: 0,
				},
				panLevelOption,
				ShowVar,
			],
			learn: async ({ options }) => {
				const mix = getFader(instance, model, options, 'mix')
				if (mix === null) {
					return
				}

				const base = SinkPanBalanceInOutputBase['mix']
				const { MSB, LSB } = computeParameters(mix, 0, 1, base)

				return {
					...options,
					showvar: `$(${instance.label}:pan_${MSB}.${LSB})`,
				}
			},
			subscribe: async ({ options }) => {
				const mix = getFader(instance, model, options, 'mix')
				if (mix === null) {
					return
				}

				const { MSB, LSB } = computeParameters(mix, 0, 1, SinkPanBalanceInOutputBase['mix'])

				// Send a "get" so the pan/balance variable is defined.
				void mixer.midi.sendCommands([mixer.getNRPNValue(MSB, LSB)])
			},
			callback: async ({ options }) => {
				const panBalance = getPanBalanceType(instance, model, options, 'mix')
				if (panBalance === null) {
					return
				}
				const { fader: mix, panBalanceChoice } = panBalance

				mixer.setMixOutputPanBalance(mix, panBalanceChoice)
			},
		},

		[OutputActionId.MatrixPanBalanceOutput]: {
			name: 'Matrix Pan/Bal to output',
			options: [
				{
					type: 'dropdown',
					label: 'Fader',
					id: 'input',
					default: 0,
					choices: choices.matrixes,
					minChoicesForSearch: 0,
				},
				panLevelOption,
				ShowVar,
			],
			learn: async ({ options }) => {
				const matrix = getFader(instance, model, options, 'matrix')
				if (matrix === null) {
					return
				}

				const { MSB, LSB } = computeParameters(matrix, 0, 1, SinkPanBalanceInOutputBase['matrix'])

				return {
					...options,
					showvar: `$(${instance.label}:pan_${MSB}.${LSB})`,
				}
			},
			subscribe: async ({ options }) => {
				const matrix = getFader(instance, model, options, 'matrix')
				if (matrix === null) {
					return
				}

				const { MSB, LSB } = computeParameters(matrix, 0, 1, SinkPanBalanceInOutputBase['matrix'])

				// Send a "get" so the pan/balance variable is defined.
				void mixer.midi.sendCommands([mixer.getNRPNValue(MSB, LSB)])
			},
			callback: async ({ options }) => {
				const panBalance = getPanBalanceType(instance, model, options, 'matrix')
				if (panBalance === null) {
					return
				}
				const { fader: matrix, panBalanceChoice } = panBalance

				mixer.setMatrixOutputPanBalance(matrix, panBalanceChoice)
			},
		},
	}
}
