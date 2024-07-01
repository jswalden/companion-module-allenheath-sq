import { combineRgb, type CompanionPresetDefinitions } from '@companion-module/base'
import type { SQInstanceInterface as sqInstance } from './instance-interface.js'
import type { Model } from './mixer/model.js'
import { MuteActionId } from './actions/action-ids.js'
import { MuteFeedbackId } from './feedbacks/feedback-ids.js'

const White = combineRgb(255, 255, 255)
const Black = combineRgb(0, 0, 0)

type MuteType = keyof typeof MuteFeedbackId & keyof typeof MuteActionId

export function getPresets(self: sqInstance, model: Model, talkbackChannel: number): CompanionPresetDefinitions {
	const presets: CompanionPresetDefinitions = {}

	/* MUTE */
	const createtMute = (cat: string, lab: string, typ: MuteType, cnt: number, nr = true): void => {
		for (let i = 0; i < cnt; i++) {
			const suffix = cnt > 1 ? `_${i}` : ''
			presets[`preset_${MuteActionId[typ]}${suffix}`] = {
				type: 'button',
				category: cat,
				name: lab + (nr ? ' ' + (i + 1) : ''),
				style: {
					text: lab + (nr ? ' ' + (i + 1) : ''),
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
						feedbackId: MuteFeedbackId[typ],
						options: {
							channel: i,
						},
					},
				],
			}
		}
	}

	createtMute('Mute Input', 'Input channel', 'MuteInputChannel', model.count.inputChannel)
	createtMute('Mute Mix - Group', 'LR', 'MuteLR', 1, false)
	createtMute('Mute Mix - Group', 'Aux', 'MuteMix', model.count.mix)
	createtMute('Mute Mix - Group', 'Group', 'MuteGroup', model.count.group)
	createtMute('Mute Mix - Group', 'Matrix', 'MuteMatrix', model.count.matrix)
	createtMute('Mute FX', 'FX Send', 'MuteFXSend', model.count.fxSend)
	createtMute('Mute FX', 'FX Return', 'MuteFXReturn', model.count.fxReturn)
	createtMute('Mute DCA', 'DCA', 'MuteDCA', model.count.dca)
	createtMute('Mute MuteGroup', 'MuteGroup', 'MuteMuteGroup', model.count.muteGroup)

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
							actionId: 'ch_to_mix',
							options: {
								inputChannel: `${talkbackChannel}`,
								mixAssign: [`99`],
								mixActive: false,
							},
						},
						{
							actionId: 'ch_to_mix',
							options: {
								inputChannel: `${talkbackChannel}`,
								mixAssign: [`${mix}`],
								mixActive: true,
							},
						},
						{
							actionId: 'chlev_to_mix',
							options: {
								input: `${talkbackChannel}`,
								assign: `${mix}`,
								level: '49',
							},
						},
						{
							actionId: 'mute_input',
							options: {
								strip: talkbackChannel,
								mute: 2,
							},
						},
					],
					up: [
						{
							actionId: 'ch_to_mix',
							options: {
								inputChannel: `${talkbackChannel}`,
								mixAssign: [`${mix}`],
								mixActive: false,
							},
						},
						{
							actionId: 'chlev_to_mix',
							options: {
								input: `${talkbackChannel}`,
								assign: `${mix}`,
								level: '0',
							},
						},
						{
							actionId: 'mute_input',
							options: {
								strip: talkbackChannel,
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
		const mixId = mix === 99 ? 'lr' : `mix${mix}`
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
			const rsp = self.getLevel(channel, mix, model.count.mix, [0x40, 0x40], [0, 0x44])
			createtMuteLevel(
				`Mt+dB CH-${mixLabel}`,
				`${channelLabel}\\n${mixLabel}\\n$(SQ:level_${rsp['channel'][0]}.${rsp['channel'][1]}) dB`,
				'MuteInputChannel',
				channel,
				mix,
			)
		})
	})
	/**/

	return presets
}
