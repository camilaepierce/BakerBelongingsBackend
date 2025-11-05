/**
 * Example synchronizations for existing concepts.
 * Flows use the Requesting concept to orchestrate auth, RBAC checks,
 * and final actions, then respond to the original HTTP request.
 */

import {
  Authorization,
  Requesting,
  Reservation,
  Roles,
  Viewer,
} from "@concepts";
import { actions, Frames, Sync } from "@engine";
import type { Vars } from "@engine";

// Route constants (Requesting.request receives action path WITHOUT the base prefix)
const VIEW_AVAILABLE = "/Viewer/viewAvailable";
const REGISTER = "/Authorization/register";
const CHECKOUT = "/Reservation/checkoutItem";

// QueryItems: Authenticate -> allowAction(viewAvailable) -> respond allowed
// Step 1: login on viewAvailable request
export const QueryItems_Login: Sync = ({ request, kerb, password }: Vars) => ({
  when: actions([
    Requesting.request,
    { path: VIEW_AVAILABLE, kerb, password },
    { request },
  ]),
  then: actions([Authorization.login, { kerb, password }]),
});

// Step 2: check authorization against "viewAvailable" action
export const QueryItems_Authorize: Sync = ({ request, userId }: Vars) => ({
  when: actions(
    [Requesting.request, { path: VIEW_AVAILABLE }, { request }],
    [Authorization.login, {}, { userId }],
  ),
  then: actions([Roles.allowAction, { user: userId, action: "viewAvailable" }]),
});

// Step 3: only if allowed, perform the view (wrapped for binding)
export const QueryItems_View: Sync = ({ request, allowed }: Vars) => ({
  when: actions(
    [Requesting.request, { path: VIEW_AVAILABLE }, { request }],
    [Roles.allowAction, {}, { allowed }],
  ),
  where: (frames: Frames) =>
    frames.filter((f) => Boolean((f as Record<symbol, unknown>)[allowed])),
  then: actions(
    [Viewer.viewAvailableWrapped, {}],
  ),
});

// Step 4: respond with items once the wrapped view has executed
export const QueryItems_FinalRespond: Sync = (
  { request, allowed, items }: Vars,
) => ({
  when: actions(
    [Requesting.request, { path: VIEW_AVAILABLE }, { request }],
    [Roles.allowAction, {}, { allowed }],
    [Viewer.viewAvailableWrapped, {}, { items }],
  ),
  where: (frames: Frames) =>
    frames.filter((f) => Boolean((f as Record<symbol, unknown>)[allowed])),
  then: actions(
    [Requesting.respond, { request, allowed: true, items }],
  ),
});

// Step 4b: if not allowed, respond with an error
export const QueryItems_RespondDenied: Sync = (
  { request, allowed }: Vars,
) => ({
  when: actions(
    [Requesting.request, { path: VIEW_AVAILABLE }, { request }],
    [Roles.allowAction, {}, { allowed }],
  ),
  where: (frames: Frames) =>
    frames.filter((f) => !(f as Record<symbol, unknown>)[allowed]),
  then: actions(
    [Requesting.respond, {
      request,
      allowed: false,
      error: "User is not authorized to view available items.",
    }],
  ),
});

// UpdateRoles: register -> promote -> respond promoted
export const UpdateRoles_Register: Sync = (
  { request, kerb, email, first, last, password, permission }: Vars,
) => ({
  when: actions([
    Requesting.request,
    { path: REGISTER, kerb, email, first, last, password, permission },
    { request },
  ]),
  then: actions([
    Authorization.register,
    { kerb, email, first, last, password, role: permission },
  ]),
});

export const UpdateRoles_PromoteAndRespond: Sync = (
  { request, kerb, permission }: Vars,
) => ({
  when: actions(
    [Requesting.request, { path: REGISTER }, { request }],
    [Authorization.register, {}, {}],
  ),
  then: actions(
    [Roles.promoteUser, { kerb, permission }],
    [Requesting.respond, { request, promoted: true }],
  ),
});

// CheckoutItem: authenticate -> allowAction(checkoutItem) -> checkout -> respond success
export const CheckoutItem_Login: Sync = (
  { request, kerb, password, itemName }: Vars,
) => ({
  when: actions([
    Requesting.request,
    { path: CHECKOUT, kerb, password, itemName },
    { request },
  ]),
  then: actions([Authorization.login, { kerb, password }]),
});

export const CheckoutItem_Authorize: Sync = ({ request, userId }: Vars) => ({
  when: actions(
    [Requesting.request, { path: CHECKOUT }, { request }],
    [Authorization.login, {}, { userId }],
  ),
  then: actions([Roles.allowAction, { user: userId, action: "checkoutItem" }]),
});

export const CheckoutItem_ExecuteAndRespond: Sync = (
  { request, allowed, kerb, itemName }: Vars,
) => ({
  when: actions(
    [Requesting.request, { path: CHECKOUT, kerb, itemName }, { request }],
    [Roles.allowAction, {}, { allowed }],
  ),
  where: (frames: Frames) =>
    frames.filter((f) => Boolean((f as Record<symbol, unknown>)[allowed])),
  then: actions(
    [Reservation.checkoutItem, { kerb, itemName }],
    [Requesting.respond, { request, success: true }],
  ),
});

// CheckoutItem: if not allowed, respond with error
export const CheckoutItem_RespondDenied: Sync = (
  { request, allowed }: Vars,
) => ({
  when: actions(
    [Requesting.request, { path: CHECKOUT }, { request }],
    [Roles.allowAction, {}, { allowed }],
  ),
  where: (frames: Frames) =>
    frames.filter((f) => !(f as Record<symbol, unknown>)[allowed]),
  then: actions(
    [Requesting.respond, {
      request,
      success: false,
      error: "User is not authorized to check out items.",
    }],
  ),
});
