import { Notice } from '../common';

const REASON_GUIDANCE = {
  blur: 'Text looks blurred. Hold the camera steady, tap the page to focus, and retake.',
  glare: 'Light glare is hiding words. Tilt the page slightly away from overhead lights.',
  low_light: 'The page is too dark. Move to brighter, even lighting before retaking.',
  cropped_text: 'Part of the paragraph is cut off at the edge. Frame the entire printed section.',
  small_text: 'The print is too small to read reliably. Move the camera closer to one section.',
  no_printed_text: 'No clear printed English textbook text was found in this image.',
  unsupported_layout: 'Complex multi-column tables or handwriting cannot be read reliably yet.',
  unsupported_language: 'MindBridge currently supports printed English textbook pages only.',
};

export function RetakeGuidance({ reasons = [], onRetake = null }) {
  if (!reasons || reasons.length === 0) return null;

  return (
    <Notice
      tone="warning"
      title="This photograph could not be read clearly enough"
      actions={
        onRetake ? (
          <button
            type="button"
            onClick={onRetake}
            className="min-h-[44px] px-3.5 py-2 rounded-[6px] border border-[#9A601C] bg-white text-[#20372D] font-semibold text-[14px] hover:bg-[#FDF3E1] cursor-pointer"
          >
            Choose a clearer photo
          </button>
        ) : null
      }
    >
      <p className="m-0 mb-2">
        To protect accuracy, MindBridge does not invent missing words. Try another photo addressing:
      </p>
      <ul className="m-0 pl-5 space-y-1">
        {reasons.map((reason) => (
          <li key={reason}>{REASON_GUIDANCE[reason] || reason}</li>
        ))}
      </ul>
    </Notice>
  );
}
