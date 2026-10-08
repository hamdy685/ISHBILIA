import React from 'react';
import ActionRequiredInbox, {
  ActionInboxItem,
  ActionInboxItemDetail,
  ActionRequiredInboxProps,
} from './ActionRequiredInbox';

export type PendingActionsProps = ActionRequiredInboxProps;

/**
 * Reviewer and role-based pending actions & required decisions card.
 * Displays unified pending items (Purchase Requests, Supplements, Quotes, Receipts).
 */
export const PendingActions: React.FC<PendingActionsProps> = (props) => {
  return <ActionRequiredInbox {...props} />;
};

export default PendingActions;
export { ActionRequiredInbox };
export type { ActionInboxItem, ActionInboxItemDetail, ActionRequiredInboxProps };
