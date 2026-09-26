import { DeviceItem } from '../hooks/useFlashKitSort';
import { CheckIcon, PlayIcon } from './Icons';

interface WorkflowStepperProps {
  bridgesCount: number;
  devices: DeviceItem[];
  selectedIds: string[];
  apFilename: string;
  onSelectAll?: () => void;
  onOpenBatchModal?: () => void;
  onOpenLogs?: () => void;
}

export const WorkflowStepper: React.FC<WorkflowStepperProps> = ({
  bridgesCount,
  devices,
  selectedIds,
  apFilename,
  onSelectAll,
  onOpenBatchModal,
  onOpenLogs,
}) => {
  const totalDevices = devices.length;
  const selectedCount = selectedIds.length;
  const flashingCount = devices.filter((d) => d.status === 'Flashing...').length;
  const passedCount = devices.filter((d) => d.status === 'Pass').length;
  const failedCount = devices.filter((d) => d.status === 'Fail').length;

  // Derive workflow step states
  // Step 1: Scan & Detect
  const isStep1Done = totalDevices > 0;
  
  // Step 2: Device Selection
  const isStep2Done = selectedCount > 0;
  const isStep2Active = isStep1Done && !isStep2Done;

  // Step 3: Payload / Firmware Setup
  const isStep3Done = Boolean(apFilename.trim());
  const isStep3Active = isStep2Done && !isStep3Done;

  // Step 4: Batch Execution
  const isStep4Active = flashingCount > 0;
  const isStep4Done = !isStep4Active && (passedCount > 0 || failedCount > 0);

  // Step 5: Verification & Logs
  const isStep5Done = totalDevices > 0 && passedCount + failedCount > 0 && flashingCount === 0;

  return (
    <nav aria-label="Provisioning Workflow" className="workflow-stepper">
      <div className="stepper-track">
        {/* Step 1: Scan & Detect */}
        <div className={`stepper-item ${isStep1Done ? 'completed' : 'active'}`}>
          <div className="step-badge">
            {isStep1Done ? <CheckIcon size={12} /> : '1'}
          </div>
          <div className="step-content">
            <span className="step-label">1. Scan & Detect</span>
            <span className="step-meta">
              {bridgesCount} PC{bridgesCount !== 1 ? 's' : ''} &bull; {totalDevices} Device{totalDevices !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="step-divider" />

        {/* Step 2: Batch Select */}
        <div
          className={`stepper-item ${isStep2Done ? 'completed' : isStep2Active ? 'active' : 'pending'} clickable`}
          onClick={onSelectAll}
          title="Click to toggle select all devices"
        >
          <div className="step-badge">
            {isStep2Done ? <CheckIcon size={12} /> : '2'}
          </div>
          <div className="step-content">
            <span className="step-label">2. Target Select</span>
            <span className="step-meta">
              {selectedCount > 0 ? `${selectedCount} Selected` : 'Select targets'}
            </span>
          </div>
        </div>

        <div className="step-divider" />

        {/* Step 3: Payload & Config */}
        <div
          className={`stepper-item ${isStep3Done ? 'completed' : isStep3Active ? 'active' : 'pending'} clickable`}
          onClick={onOpenBatchModal}
          title="Click to configure firmware / payload"
        >
          <div className="step-badge">
            {isStep3Done ? <CheckIcon size={12} /> : '3'}
          </div>
          <div className="step-content">
            <span className="step-label">3. Payload Config</span>
            <span className="step-meta" style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isStep3Done ? apFilename : 'Set AP / Command'}
            </span>
          </div>
        </div>

        <div className="step-divider" />

        {/* Step 4: Batch Execute */}
        <div
          className={`stepper-item ${isStep4Done ? 'completed' : isStep4Active ? 'active flashing' : 'pending'} clickable`}
          onClick={onOpenBatchModal}
          title="Click to trigger batch execution"
        >
          <div className="step-badge">
            {isStep4Done ? <CheckIcon size={12} /> : isStep4Active ? <PlayIcon size={12} /> : '4'}
          </div>
          <div className="step-content">
            <span className="step-label">4. Flash Execute</span>
            <span className="step-meta">
              {flashingCount > 0 ? `${flashingCount} Flashing...` : 'Ready to run'}
            </span>
          </div>
        </div>

        <div className="step-divider" />

        {/* Step 5: Verify & Logs */}
        <div
          className={`stepper-item ${isStep5Done ? 'completed' : 'pending'} clickable`}
          onClick={onOpenLogs}
          title="Click to open global logs drawer"
        >
          <div className="step-badge">
            {isStep5Done ? <CheckIcon size={12} /> : '5'}
          </div>
          <div className="step-content">
            <span className="step-label">5. Verify & Pass</span>
            <span className="step-meta">
              {passedCount > 0 || failedCount > 0
                ? `${passedCount} Pass / ${failedCount} Fail`
                : 'Pending results'}
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
};
