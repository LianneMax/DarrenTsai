# Deploying the Apps Script with clasp

How to put a new version of `google-apps-script.js` live **without changing the `/exec` URL**. Written for the @45 release (the Sheet formula guard, 10 Oct 2026); the same steps work for any later version.

The one rule: **update the existing deployment in place.** Never `clasp deploy` without `-i`/`--deploymentId`: that creates a new deployment with a new `/exec` URL, and every form on the site keeps posting to the old one.

## What @45 is

- Source: `google-apps-script.js` at commit `997054f` (merged into `main`).
- Change against live @44: 32 lines added, 7 changed, nothing else. It adds `safeCell` and `appendSafeRow`, and the seven `sheet.appendRow(` calls that write visitor input become `appendSafeRow(sheet, `.
- No site change is needed with it, and none depends on it. It can go before or after the site merge.

## After @45: @46, the confirmation emails

The branch tip also has the R2 routing (`confirmationContext`): debt, home equity, ADU and mortgage-calculator review leads get their approved confirmation email. Deploy it as @46 **only after the site is merged to `main` and live**, because the email words ship with the site. Same steps, with the branch tip's commit in step 2, and expect step 4's diff against @45 to be only `CONFIRMATION_CONTEXTS`, `confirmationContext` and the new `sendContactConfirmation`.

## @47: R1, the Sheet schema release

Verified 10 Oct 2026: @47 is deployed in place from main `656bed7`; editor code also matches the later frontend-only main. Deployment count remains 20, manifest unchanged, `/exec` returns `{"status":"ok"}`. **Migration completed at 16:23:59**, after a fresh private owner-account backup and clean live audit. Historical rows were independently compared by header; fake tests passed for all seven active lead tabs and their queues. Original tabs are retained. Evidence is retained in the local audit. The steps below are historical release/rollback guidance, not an instruction to repeat a completed migration.

Deploy it only inside the migration window, as step 2 of `docs/MANUAL-TEST-RUNBOOK.md` section 0.5, straight after copying the spreadsheet and straight before `auditLeadTabs()`. Source: `google-apps-script.js` on `main` at the R1 merge or later. Use the steps below with that commit in step 2 and `dt-47` in the folder names. Step 4's diff against @46 is large this time (rows written by header name, the migration and audit functions), so check the other way round: the file you clone in step 3 must match `main` at `8740407`, which is @46. If it does not, stop: someone changed the editor since @46.

Deploying it without migrating is safe (rows are written by name), but it mails a "Sheet columns out of order" notice per tab every 6 hours until the migration runs.

## Steps (Windows, PowerShell)

Replace `<REPO>` with your clone (`C:\Users\Lmbal\OneDrive\Documents\GitHub\DarrenTsai\DarrenTsai`) and `<SCRIPT_ID>` with the script ID in your existing `.clasp.json` (the long ID of the "Darren Tsai | Lead Database" project, not the `AKfycb...` deployment ID).

1. **Check clasp and the login.**
   ```powershell
   clasp --version
   clasp login --status
   ```
   Note the version: 2.x and 3.x name two commands differently (step 6 and 7 give both).

2. **Get the exact file to deploy, without touching your working copy.** A temporary worktree checks out `997054f` in its own folder.
   ```powershell
   git -C <REPO> fetch origin
   git -C <REPO> worktree add $env:TEMP\dt-45 997054f
   ```

3. **Pull what is in the Apps Script editor now, into a clean folder.**
   ```powershell
   mkdir $env:TEMP\dt-clasp-45
   cd $env:TEMP\dt-clasp-45
   clasp clone <SCRIPT_ID>
   ```
   You should get `Code.js` and `appsscript.json`.

4. **Check nobody edited the script in the editor, and that the change is only the guard.**
   ```powershell
   git diff --no-index --ignore-cr-at-eol --stat Code.js $env:TEMP\dt-45\google-apps-script.js
   git diff --no-index --ignore-cr-at-eol Code.js $env:TEMP\dt-45\google-apps-script.js
   ```
   Expected: `1 file changed, 32 insertions(+), 7 deletions(-)`, and every change is `safeCell`, `appendSafeRow`, or an `appendRow(` line becoming `appendSafeRow(sheet, `. **If you see anything else, stop**: someone changed the live script by hand, and that change would be overwritten. Send me the diff.

5. **Replace the code and push it.**
   ```powershell
   Copy-Item $env:TEMP\dt-45\google-apps-script.js .\Code.js -Force
   clasp push
   ```
   If clasp asks whether to overwrite the manifest, answer yes: `appsscript.json` is the one you just cloned, unchanged. `clasp push` only updates the editor's code; nothing is live yet.

6. **Make version 45.**
   ```powershell
   clasp version "Security: visitor text cannot become a Sheet formula (safeCell)"
   ```
   (clasp 3.x: `clasp create-version "..."`.) It prints the new version number. It should be **45**; if it is not, use the number it printed below.

7. **Point the existing deployment at it.** First find the deployment ID, the `AKfycbybhK2j...` one (not the `@HEAD` line):
   ```powershell
   clasp deployments
   ```
   (clasp 3.x: `clasp list-deployments`.) Then:
   ```powershell
   clasp deploy -i <DEPLOYMENT_ID> -V 45 -d "Security: Sheet formula guard"
   ```
   (clasp 3.x: `clasp update-deployment <DEPLOYMENT_ID> -V 45 -d "Security: Sheet formula guard"`. Run `clasp --help` if either name is refused.)

8. **Check it took.**
   ```powershell
   clasp deployments
   ```
   The `AKfycbybhK2j...` line should now say `@45`, and the number of deployments should be the same as before (20). The listing can lag a minute: if it still says @44, wait and run it again. Then open the `/exec` URL in a browser: it should still answer `{"status":"ok"}`.

9. **Clean up.**
   ```powershell
   cd ~
   git -C <REPO> worktree remove $env:TEMP\dt-45
   Remove-Item -Recurse -Force $env:TEMP\dt-clasp-45
   ```

## The live test

One lead proves the guard works. Use a 555-01xx phone number, which the script treats as a test lead, so Bonzo and HubSpot skip it. The contact confirmation email still goes out, to your own address, greeting you by the formula as plain text.

1. Open `https://realdarrentsai.com/realestateinvesting/`, then the Contact button.
2. First name: `=UPPER("guard")`. Last name: `TEST45`. Email: your own `+guard` address. Phone: `(714) 555-0145`. Any state.
3. Submit, then open the Leads tab.
   - **Working:** the First Name cell shows `=UPPER("guard")` as plain text.
   - **Not working:** it shows `GUARD`, meaning the formula ran. Roll back (below) and tell me.
4. Delete the test row from Leads and its row from Follow-ups.

## Rollback

Same command as step 7 with the previous version: `clasp deploy -i <DEPLOYMENT_ID> -V 44` (3.x: `clasp update-deployment <DEPLOYMENT_ID> -V 44`). The URL never changes, so the site needs nothing.

## What to send back

The output of step 4's `--stat`, step 6 (the version number), and step 8, plus whether the test lead's First Name showed as text. With those I can confirm @45 is exactly the reviewed file and update the checklist.
