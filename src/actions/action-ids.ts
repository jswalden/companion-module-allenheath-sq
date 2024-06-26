import { type CompanionActionDefinition } from '@companion-module/base'

/**
 * The type of action definitions for all actions within the specified action
 * set.
 */
export type ActionDefinitions<ActionSet extends string> = {
	[actionId in ActionSet]: CompanionActionDefinition
}

/**
 * Action IDs for all actions that mute, unmute, or toggle muting of a mixer
 * input/output.
 */
export enum MuteActionId {
	MuteInputChannel = 'mute_input',
	MuteLR = 'mute_lr',
	MuteMix = 'mute_aux',
	MuteGroup = 'mute_group',
	MuteMatrix = 'mute_matrix',
	MuteFXSend = 'mute_fx_send',
	MuteFXReturn = 'mute_fx_return',
	MuteDCA = 'mute_dca',
	MuteMuteGroup = 'mute_mutegroup',
}

/**
 * Action IDs for all actions that activate/deactivate a mixer source within a
 * sink.
 */
export enum AssignActionId {
	ChannelToMix = 'ch_to_mix',
	ChannelToGroup = 'ch_to_grp',
	GroupToMix = 'grp_to_mix',
	FXReturnToGroup = 'fxr_to_grp',
	ChannelToFXSend = 'ch_to_fxs',
	GroupToFXSend = 'grp_to_fxs',
	FXReturnToFXSend = 'fxr_to_fxs',
	MixToMatrix = 'mix_to_mtx',
	GroupToMatrix = 'grp_to_mtx',
}

/** Action IDs for all actions that change the mixer's current scene. */
export enum SceneActionId {
	SceneRecall = 'scene_recall',
	SceneStep = 'scene_step',
}

/** Action IDs for all actions that operate softkeys. */
export enum SoftKeyId {
	SoftKey = 'key_soft',
}

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

/**
 * Action IDs for all actions setting the pan/balance of a mixer source in a
 * mixer sink.
 */
export enum PanBalanceActionId {
	InputChannelPanBalanceInMixOrLR = 'chpan_to_mix',
	GroupPanBalanceInMixOrLR = 'grppan_to_mix',
	FXReturnPanBalanceInMixOrLR = 'fxrpan_to_mix',
	FXReturnPanBalanceInGroup = 'fxrpan_to_grp',
	MixOrLRPanBalanceInMatrix = 'mixpan_to_mtx',
	GroupPanBalanceInMatrix = 'grppan_to_mtx',
}

/** Action IDs for all actions affecting sinks used as direct mixer outputs. */
export enum OutputActionId {
	OutputLevel = 'level_to_output',
	OutputPanBalance = 'pan_to_output',
}

const ActionId = {
	...MuteActionId,
	...AssignActionId,
	...SceneActionId,
	...SoftKeyId,
	...LevelActionId,
	...PanBalanceActionId,
	...OutputActionId,
} as const

/** All action IDs. */
export type ActionId = keyof typeof ActionId
