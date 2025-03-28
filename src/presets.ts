import { combineRgb, type CompanionPresetDefinitions } from '@companion-module/base'
import { LR, type Model } from './mixer/model.js'
import { AssignActionId } from './actions/assign.js'
import { LevelActionId } from './actions/level.js'
import { MuteActionId } from './actions/mute.js'
import { MuteFeedbackId } from './feedbacks/feedback-ids.js'
import type { sqInstance } from './instance.js'
import { SourceToSinkParameterBase } from './mixer/nrpn/source-to-sink.js'
import { computeEitherParameters } from './mixer/parameters.js'

const White = combineRgb(255, 255, 255)
const Black = combineRgb(0, 0, 0)

// Doesn't this lint make *no sense* for intersections?  The intersection of two
// types that *do not* duplicate is just `never`, which makes any such
// intersection's result totally vacuous...right?
// eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
type MuteType = keyof typeof MuteFeedbackId & keyof typeof MuteActionId

export function getPresets(instance: sqInstance, model: Model): CompanionPresetDefinitions {
	const presets: CompanionPresetDefinitions = {}

	/* MUTE */
	const createtMute = (category: string, label: string, type: MuteType, count: number): void => {
		for (let i = 0; i < count; i++) {
			const suffix = count > 1 ? `_${i}` : ''
			const maybeSpaceNum = count > 1 ? ` ${i + 1}` : ''
			presets[`preset_${MuteActionId[type]}${suffix}`] = {
				type: 'button',
				category,
				name: `${label}${maybeSpaceNum}`,
				style: {
					text: `${label}${maybeSpaceNum}`,
					size: 'auto',
					color: White,
					bgcolor: Black,
				},
				steps: [
					{
						down: [
							{
								actionId: MuteActionId[type],
								options: {
									strip: i,
									mute: 0,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: MuteFeedbackId[type],
						options: {
							channel: i,
						},
					},
				],
			}
		}
	}

	createtMute('Mute Input', 'Input channel', 'MuteInputChannel', model.inputOutputCounts.inputChannel)
	createtMute('Mute Mix - Group', 'LR', 'MuteLR', model.inputOutputCounts.lr)
	createtMute('Mute Mix - Group', 'Aux', 'MuteMix', model.inputOutputCounts.mix)
	createtMute('Mute Mix - Group', 'Group', 'MuteGroup', model.inputOutputCounts.group)
	createtMute('Mute Mix - Group', 'Matrix', 'MuteMatrix', model.inputOutputCounts.matrix)
	createtMute('Mute FX', 'FX Send', 'MuteFXSend', model.inputOutputCounts.fxSend)
	createtMute('Mute FX', 'FX Return', 'MuteFXReturn', model.inputOutputCounts.fxReturn)
	createtMute('Mute DCA', 'DCA', 'MuteDCA', model.inputOutputCounts.dca)
	createtMute('Mute MuteGroup', 'MuteGroup', 'MuteMuteGroup', model.inputOutputCounts.muteGroup)

	/* TALKBACK*/
	model.forEachMix((mix, mixLabel, mixDesc) => {
		presets[`preset_talkback_mix${mix}`] = {
			type: 'button',
			category: 'Talkback',
			name: `Talk to ${mixDesc}`,
			style: {
				text: `Talk to ${mixLabel}`,
				size: 'auto',
				color: White,
				bgcolor: Black,
			},
			steps: [
				{
					down: [
						{
							actionId: AssignActionId.InputChannelToMix,
							options: {
								inputChannel: instance.options.talkbackChannel,
								mixAssign: [LR],
								mixActive: false,
							},
						},
						{
							actionId: AssignActionId.InputChannelToMix,
							options: {
								inputChannel: instance.options.talkbackChannel,
								mixAssign: [mix],
								mixActive: true,
							},
						},
						{
							actionId: LevelActionId.InputChannelLevelInMixOrLR,
							options: {
								input: instance.options.talkbackChannel,
								assign: mix,
								level: 49,
							},
						},
						{
							actionId: MuteActionId.MuteInputChannel,
							options: {
								strip: instance.options.talkbackChannel,
								mute: 2,
							},
						},
					],
					up: [
						{
							actionId: AssignActionId.InputChannelToMix,
							options: {
								inputChannel: instance.options.talkbackChannel,
								mixAssign: [mix],
								mixActive: false,
							},
						},
						{
							actionId: LevelActionId.InputChannelLevelInMixOrLR,
							options: {
								input: instance.options.talkbackChannel,
								assign: mix,
								level: 0,
							},
						},
						{
							actionId: MuteActionId.MuteInputChannel,
							options: {
								strip: instance.options.talkbackChannel,
								mute: 1,
							},
						},
					],
				},
			],
			feedbacks: [],
		}
	})

	/* MUTE + FADER LEVEL */
	const createtMuteLevel = (cat: string, lab: string, typ: MuteType, ch: number, mix: number): void => {
		const mixId = mix === LR ? 'lr' : `mix${mix}`
		presets[`preset_mute_input${ch}_${mixId}`] = {
			type: 'button',
			category: cat,
			name: lab,
			style: {
				text: lab,
				size: 'auto',
				color: White,
				bgcolor: Black,
			},
			steps: [
				{
					down: [
						{
							actionId: MuteActionId[typ],
							options: {
								strip: ch,
								mute: 0,
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: MuteFeedbackId[typ],
					options: {
						channel: ch,
					},
				},
			],
		}
	}

	// Input -> Mix
	model.forEachInputChannel((channel, channelLabel) => {
		model.forEachMixAndLR((mix, mixLabel) => {
			const { MSB, LSB } = computeEitherParameters(
				channel,
				mix,
				model.inputOutputCounts.mix,
				SourceToSinkParameterBase.inputChannel.mix.level,
				SourceToSinkParameterBase.inputChannel.lr.level,
			)

			createtMuteLevel(
				`Mt+dB CH-${mixLabel}`,
				`${channelLabel}\\n${mixLabel}\\n$(${instance.label}:level_${MSB}.${LSB}) dB`,
				'MuteInputChannel',
				channel,
				mix,
			)
		})
	})
	/**/

	return presets
}
