import type {
	CompanionMigrationAction,
	CompanionMigrationFeedback,
	CompanionStaticUpgradeProps,
	CompanionStaticUpgradeScript,
	CompanionUpgradeContext,
} from '@companion-module/base'
import type { RawConfig, SQConfig } from '../config.js'

type UpgradeContext = CompanionUpgradeContext<SQConfig>
type UpgradeProps = CompanionStaticUpgradeProps<SQConfig>
type UpgradeScript = CompanionStaticUpgradeScript<SQConfig>

export function ActionUpdater(tryUpdate: (action: CompanionMigrationAction) => boolean): UpgradeScript {
	return (_context: UpgradeContext, props: UpgradeProps) => {
		return {
			updatedActions: props.actions.filter(tryUpdate),
			updatedFeedbacks: [],
			updatedConfig: null,
			updatedSecrets: null,
		}
	}
}

export function ConfigUpdater(tryUpdate: (config: RawConfig) => boolean): UpgradeScript {
	return (_context: UpgradeContext, props: UpgradeProps) => {
		return {
			updatedActions: [],
			updatedFeedbacks: [],
			updatedConfig: props.config !== null && tryUpdate(props.config) ? props.config : null,
			updatedSecrets: null,
		}
	}
}

export function FeedbackUpdater(tryUpdate: (feedback: CompanionMigrationFeedback) => boolean): UpgradeScript {
	return (_context: UpgradeContext, props: UpgradeProps) => {
		return {
			updatedActions: [],
			updatedFeedbacks: props.feedbacks.filter(tryUpdate),
			updatedConfig: null,
			updatedSecrets: null,
		}
	}
}
