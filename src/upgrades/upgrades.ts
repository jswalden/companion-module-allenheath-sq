import { type CompanionStaticUpgradeScript, EmptyUpgradeScript } from '@companion-module/base'
import { tryFixFXRLevelInFXSIdTypo } from '../actions/level.js'
import { tryMakeMuteItemOneIndexed, tryTrimMuteLROptions } from '../actions/mute.js'
import {
	tryConvertOldLevelToOutputActionToSinkSpecific,
	tryMakeOutputLevelItemOneIndexed,
} from '../actions/output/level.js'
import {
	tryConvertOldPanToOutputActionToSinkSpecific,
	tryMakeOutputPanBalanceItemOneIndexed,
} from '../actions/output/pan-balance.js'
import { tryCoalesceSceneRecallActions } from '../actions/scene.js'
import { tryMakeSoftKeyOneIndexed } from '../actions/softkey.js'
import { tryMakeSourceSinkOptionsUserFriendly } from '../actions/user-friendly-sources-sinks.js'
import {
	type SQConfig,
	type SQSecrets,
	tryEnsureLabelInConfig,
	tryEnsureModelOptionInConfig,
	tryRemoveUnnecessaryLabelInConfig,
	tryRenameVariousConfigIds,
} from '../config.js'
import { tryMakeMuteFeedbackItemOneIndexed, tryRemoveChannelFromMuteLRFeedback } from '../feedbacks/mute.js'
import { tryUpdateAllLRMixEncodings } from '../mixer/lr.js'
import { ConfigUpdater } from './updaters.js'
import { ExpressionlessActionUpdater, ExpressionlessFeedbackUpdater } from './expressionless-updaters.js'

export const UpgradeScripts = [
	EmptyUpgradeScript,
	ExpressionlessActionUpdater(tryCoalesceSceneRecallActions),
	ConfigUpdater(tryEnsureModelOptionInConfig),
	ConfigUpdater(tryEnsureLabelInConfig),
	ExpressionlessActionUpdater(tryConvertOldLevelToOutputActionToSinkSpecific),
	ExpressionlessActionUpdater(tryConvertOldPanToOutputActionToSinkSpecific),
	// ...yes, we added the `'label'` config option above because we thought it
	// was the only way to get the instance label, and now we're removing it
	// because there in fact *is* a way to get that label without requiring that
	// users redundantly specify it.  So it goes.
	ConfigUpdater(tryRemoveUnnecessaryLabelInConfig),
	ExpressionlessActionUpdater(tryUpdateAllLRMixEncodings),
	ExpressionlessActionUpdater(tryFixFXRLevelInFXSIdTypo),
	ConfigUpdater(tryRenameVariousConfigIds),
	// Meticulously update every formerly zero-based option value to one-based,
	// because a great many options, in order to be selectable by expression, need
	// to be user-understandable.  Boo-urns!
	ExpressionlessActionUpdater(tryMakeSoftKeyOneIndexed),
	ExpressionlessActionUpdater(tryMakeMuteItemOneIndexed),
	ExpressionlessActionUpdater(tryTrimMuteLROptions),
	ExpressionlessActionUpdater(tryMakeOutputLevelItemOneIndexed),
	ExpressionlessActionUpdater(tryMakeOutputPanBalanceItemOneIndexed),
	ExpressionlessFeedbackUpdater(tryRemoveChannelFromMuteLRFeedback),
	ExpressionlessFeedbackUpdater(tryMakeMuteFeedbackItemOneIndexed),
	ExpressionlessActionUpdater(tryMakeSourceSinkOptionsUserFriendly),
	// Here endeth meticulous, exhaustive updating of all zero-indexed option
	// values to one-indexed.
] satisfies CompanionStaticUpgradeScript<SQConfig, SQSecrets>[]
