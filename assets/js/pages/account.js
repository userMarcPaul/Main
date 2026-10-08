/* Login and signup forms. One module serves both pages; it picks its behaviour
   from whichever form is present. */

import { initChrome, safeNext } from "../ui/chrome.js";
import { signup, login, me } from "../data/api.js";

initChrome();

const signupForm = document.getElementById("signup-form");
const loginForm = document.getElementById("login-form");
const form = signupForm ?? loginForm;
if (form) wire(form, signupForm ? signup : login);

// Already logged in? There is nothing to do here — go where they were headed.
me().then((user) => {
  if (user) location.replace(nextTarget());
});

function nextTarget() {
  return safeNext(new URLSearchParams(location.search).get("next"));
}

function wire(form, submitRequest) {
  const formError = document.getElementById("form-error");
  const submit = form.querySelector(".auth-submit");
  const submitLabel = submit.textContent;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors(form, formError);

    const payload = Object.fromEntries(new FormData(form).entries());

    submit.disabled = true;
    submit.textContent = "Please wait…";

    try {
      await submitRequest(payload);
      // Cookie is set; go to the remembered page (or home).
      location.href = nextTarget();
    } catch (error) {
      submit.disabled = false;
      submit.textContent = submitLabel;

      if (error.fieldErrors) {
        showFieldErrors(error.fieldErrors);
        // A field error that has no matching input still needs to be seen.
        const unplaced = Object.keys(error.fieldErrors).filter((f) => !form.elements[f]);
        if (unplaced.length) showFormError(formError, error.message);
      } else {
        showFormError(formError, error.message);
      }
    }
  });

  // Clear a field's error as soon as the user starts fixing it.
  form.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => clearFieldError(input));
  });
}

function showFieldErrors(fieldErrors) {
  for (const [field, message] of Object.entries(fieldErrors)) {
    const error = document.getElementById(`${field}-error`);
    const input = document.getElementById(field);
    if (error) { error.textContent = message; error.hidden = false; }
    if (input) input.setAttribute("aria-invalid", "true");
  }
}

function clearFieldError(input) {
  input.removeAttribute("aria-invalid");
  const error = document.getElementById(`${input.id}-error`);
  if (error) { error.hidden = true; error.textContent = ""; }
}

function showFormError(node, message) {
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
}

function clearErrors(form, formError) {
  if (formError) { formError.hidden = true; formError.textContent = ""; }
  form.querySelectorAll(".auth-field-error").forEach((el) => { el.hidden = true; el.textContent = ""; });
  form.querySelectorAll("input").forEach((el) => el.removeAttribute("aria-invalid"));
}
