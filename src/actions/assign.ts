import { type InputValue } from '@companion-module/base'
import { type Choices } from '../choices.js'
import { type SQInstanceInterface as sqInstance } from '../instance-interface.js'
import { type Mixer } from '../mixer/mixer.js'
import { type InputOutputType, type Model } from '../mixer/model.js'
import { AssignActionId, type ActionDefinitions } from './action-ids.js'

/**
 * Convert the options value for a multidropdown field of numbered sinks into a
 * well-typed list of sink numbers.
 *
 * @param assign
 *   An `options.<sink type>Assign` value.
 * @param model
 *   The model of the mixer.
 * @param sinkType
 *   The type of the sinks.
 * @returns
 *   An array of sinks.
 */
function assignOptionToSinks(
	assign: InputValue | undefined,
	model: Model,
	sinkType: Exclude<InputOutputType, 'mix'>,
): number[] {
	if (!Array.isArray(assign)) {
		return []
	}

	const sinkCount = model.count[sinkType]
	const sinks: number[] = []
	for (const item of assign) {
		const sink = Number(item)
		if (sink < sinkCount) {
			sinks.push(sink)
		}
	}
	return sinks
}

/**
 * Convert the options value for a multidropdown field of numbered mixes-or-LR
 * into a well-typed list of numbers.
 *
 * @param mixAssign
 *   An `options.mixAssign` value consisting of zero or more mixes and LR.
 * @param model
 *   The model of the mixer.
 * @returns
 *   An array of sinks.
 */
function mixesAndLRAssignOptionToSinks(mixAssign: InputValue | undefined, model: Model): number[] {
	if (!Array.isArray(mixAssign)) {
		return []
	}

	const sinkCount = model.count.mix
	const sinks: number[] = []
	for (const item of mixAssign) {
		const sink = Number(item)
		if (sink < sinkCount || sink === 99) {
			sinks.push(sink)
		}
	}
	return sinks
}

/**
 * Given an option value `optionValue` that purports to identify a source of the
 * given `type`, determine whether it refers to a valid source.  If it does,
 * return its number.  If not, log an error and return null.
 *
 * `optionValue` is not allowed to refer to the LR mix if `type === 'mix'`.  LR
 * must be handled separate from other mix values in this case.
 *
 * @param instance
 *   The active module instance.
 * @param model
 *   The mixer model.
 * @param optionValue
 *   The option value identifying a source of type `type`.
 * @param type
 *   The type of the source being identified.
 * @returns
 *   The source if one was validly encoded, or else null.
 */
function getSource(
	instance: sqInstance,
	model: Model,
	optionValue: InputValue | undefined,
	type: InputOutputType,
): number | null {
	const n = Number(optionValue)
	if (n < model.count[type]) {
		return n
	}

	instance.log('error', `Invalid ${type} (${optionValue})`)
	return null
}

/**
 * Generate action definitions for assigning sources to mixes: input channel to
 * mix, group to mix/aux, input channel to FX send, output to matrix, and so
 * on and so forth.
 *
 * @param instance
 *   The instance for which actions are being generated.
 * @param mixer
 *   The mixer object to use when executing the actions.
 * @param choices
 *   Option choices for use in the actions.
 * @returns
 *   The set of all assignment action definitions.
 */
export function assignActions(instance: sqInstance, mixer: Mixer, choices: Choices): ActionDefinitions<AssignActionId> {
	const model = mixer.model

	return {
		[AssignActionId.ChannelToMix]: {
			name: 'Assign channel to mix',
			options: [
				{
					type: 'dropdown',
					label: 'Input Channel',
					id: 'inputChannel',
					default: 0,
					choices: choices.inputChannels,
					minChoicesForSearch: 0,
				},
				{
					type: 'multidropdown',
					label: 'Mix',
					id: 'mixAssign',
					default: [],
					choices: choices.mixesAndLR,
				},
				{
					type: 'checkbox',
					label: 'Active',
					id: 'mixActive',
					default: true,
				},
			],
			callback: async ({ options }) => {
				const inputChannel = getSource(instance, model, options.inputChannel, 'inputChannel')
				if (inputChannel === null) {
					return
				}
				const active = Boolean(options.mixActive)
				const mixes = mixesAndLRAssignOptionToSinks(options.mixAssign, mixer.model)
				mixer.assignInputChannelToMixesAndLR(inputChannel, active, mixes)
			},
		},

		[AssignActionId.ChannelToGroup]: {
			name: 'Assign channel to group',
			options: [
				{
					type: 'dropdown',
					label: 'Input Channel',
					id: 'inputChannel',
					default: 0,
					choices: choices.inputChannels,
					minChoicesForSearch: 0,
				},
				{
					type: 'multidropdown',
					label: 'Group',
					id: 'grpAssign',
					default: [],
					choices: choices.groups,
				},
				{
					type: 'checkbox',
					label: 'Active',
					id: 'grpActive',
					default: true,
				},
			],
			callback: async ({ options }) => {
				const inputChannel = getSource(instance, model, options.inputChannel, 'inputChannel')
				if (inputChannel === null) {
					return
				}
				const active = Boolean(options.grpActive)
				const groups = assignOptionToSinks(options.grpAssign, mixer.model, 'group')
				mixer.assignInputChannelToGroups(inputChannel, active, groups)
			},
		},

		[AssignActionId.GroupToMix]: {
			name: 'Assign group to mix',
			options: [
				{
					type: 'dropdown',
					label: 'Group',
					id: 'inputGrp',
					default: 0,
					choices: choices.groups,
					minChoicesForSearch: 0,
				},
				{
					type: 'multidropdown',
					label: 'Mix',
					id: 'mixAssign',
					default: [],
					choices: choices.mixesAndLR,
				},
				{
					type: 'checkbox',
					label: 'Active',
					id: 'mixActive',
					default: true,
				},
			],
			callback: async ({ options }) => {
				const group = getSource(instance, model, options.inputGrp, 'group')
				if (group === null) {
					return
				}
				const active = Boolean(options.mixActive)
				const mixes = mixesAndLRAssignOptionToSinks(options.mixAssign, mixer.model)
				mixer.assignGroupToMixesAndLR(group, active, mixes)
			},
		},

		[AssignActionId.FXReturnToGroup]: {
			name: 'Assign FX Return to group',
			options: [
				{
					type: 'dropdown',
					label: 'FX Return',
					id: 'inputFxr',
					default: 0,
					choices: choices.fxReturns,
					minChoicesForSearch: 0,
				},
				{
					type: 'multidropdown',
					label: 'Group',
					id: 'grpAssign',
					default: [],
					choices: choices.groups,
				},
				{
					type: 'checkbox',
					label: 'Active',
					id: 'grpActive',
					default: true,
				},
			],
			callback: async ({ options }) => {
				const fxReturn = getSource(instance, model, options.inputFxr, 'fxReturn')
				if (fxReturn === null) {
					return
				}
				const active = Boolean(options.grpActive)
				const groups = assignOptionToSinks(options.grpAssign, mixer.model, 'group')
				mixer.assignFXReturnToGroups(fxReturn, active, groups)
			},
		},

		[AssignActionId.ChannelToFXSend]: {
			name: 'Assign channel to FX Send',
			options: [
				{
					type: 'dropdown',
					label: 'Input Channel',
					id: 'inputChannel',
					default: 0,
					choices: choices.inputChannels,
					minChoicesForSearch: 0,
				},
				{
					type: 'multidropdown',
					label: 'FX Send',
					id: 'fxsAssign',
					default: [],
					choices: choices.fxSends,
				},
				{
					type: 'checkbox',
					label: 'Active',
					id: 'fxsActive',
					default: true,
				},
			],
			callback: async ({ options }) => {
				const inputChannel = getSource(instance, model, options.inputChannel, 'inputChannel')
				if (inputChannel === null) {
					return
				}
				const active = Boolean(options.fxsActive)
				const fxSends = assignOptionToSinks(options.fxsAssign, mixer.model, 'fxSend')
				mixer.assignInputChannelToFXSends(inputChannel, active, fxSends)
			},
		},

		[AssignActionId.GroupToFXSend]: {
			name: 'Assign group to FX send',
			options: [
				{
					type: 'dropdown',
					label: 'Group',
					id: 'inputGrp',
					default: 0,
					choices: choices.groups,
					minChoicesForSearch: 0,
				},
				{
					type: 'multidropdown',
					label: 'FX Send',
					id: 'fxsAssign',
					default: [],
					choices: choices.fxSends,
				},
				{
					type: 'checkbox',
					label: 'Active',
					id: 'fxsActive',
					default: true,
				},
			],
			callback: async ({ options }) => {
				const group = getSource(instance, model, options.inputGrp, 'group')
				if (group === null) {
					return
				}
				const active = Boolean(options.fxsActive)
				const fxSends = assignOptionToSinks(options.fxsAssign, mixer.model, 'fxSend')
				mixer.assignGroupToFXSends(group, active, fxSends)
			},
		},

		[AssignActionId.FXReturnToFXSend]: {
			name: 'Assign FX return to FX send',
			options: [
				{
					type: 'dropdown',
					label: 'FX return',
					id: 'inputFxr',
					default: 0,
					choices: choices.fxReturns,
					minChoicesForSearch: 0,
				},
				{
					type: 'multidropdown',
					label: 'FX Send',
					id: 'fxsAssign',
					default: [],
					choices: choices.fxSends,
				},
				{
					type: 'checkbox',
					label: 'Active',
					id: 'fxsActive',
					default: true,
				},
			],
			callback: async ({ options }) => {
				const fxReturn = getSource(instance, model, options.inputFxr, 'fxReturn')
				if (fxReturn === null) {
					return
				}
				const active = Boolean(options.fxsActive)
				const fxSends = assignOptionToSinks(options.fxsAssign, mixer.model, 'fxSend')
				mixer.assignFXReturnToFXSends(fxReturn, active, fxSends)
			},
		},

		[AssignActionId.MixToMatrix]: {
			name: 'Assign mix to matrix',
			options: [
				{
					type: 'dropdown',
					label: 'Mix',
					id: 'inputMix',
					default: 0,
					choices: choices.mixesAndLR,
					minChoicesForSearch: 0,
				},
				{
					type: 'multidropdown',
					label: 'Matrix',
					id: 'mtxAssign',
					default: [],
					choices: choices.matrixes,
				},
				{
					type: 'checkbox',
					label: 'Active',
					id: 'mtxActive',
					default: true,
				},
			],
			callback: async ({ options }) => {
				const active = Boolean(options.mtxActive)
				const matrixes = assignOptionToSinks(options.mtxAssign, mixer.model, 'matrix')
				const source = options.inputMix
				if (Number(source) === 99) {
					mixer.assignLRToMatrixes(active, matrixes)
				} else {
					const mix = getSource(instance, model, source, 'mix')
					if (mix === null) {
						return
					}
					mixer.assignMixToMatrixes(mix, active, matrixes)
				}
			},
		},

		[AssignActionId.GroupToMatrix]: {
			name: 'Assign group to matrix',
			options: [
				{
					type: 'dropdown',
					label: 'Group',
					id: 'inputGrp',
					default: 0,
					choices: choices.groups,
					minChoicesForSearch: 0,
				},
				{
					type: 'multidropdown',
					label: 'Matrix',
					id: 'mtxAssign',
					default: [],
					choices: choices.matrixes,
				},
				{
					type: 'checkbox',
					label: 'Active',
					id: 'mtxActive',
					default: true,
				},
			],
			callback: async ({ options }) => {
				const group = getSource(instance, model, options.inputGrp, 'group')
				if (group === null) {
					return
				}
				const active = Boolean(options.mtxActive)
				const matrixes = assignOptionToSinks(options.mtxAssign, mixer.model, 'matrix')
				mixer.assignGroupToMatrixes(group, active, matrixes)
			},
		},
	}
}
