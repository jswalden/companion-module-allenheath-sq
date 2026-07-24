import type {
	CompanionMigrationAction,
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
		}
	}
}

export function ConfigUpdater(tryUpdate: (config: RawConfig) => boolean): UpgradeScript {
	return (_context: UpgradeContext, props: UpgradeProps) => {
		return {
			updatedActions: [],
			updatedFeedbacks: [],
			updatedConfig: props.config !== null && tryUpdate(props.config) ? props.config : null,
		}
	}
}
