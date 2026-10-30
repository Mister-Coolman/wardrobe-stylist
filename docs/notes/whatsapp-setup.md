# WhatsApp setup

About 15 minutes, all yours: these are account and secret steps. Nothing here goes in the repo.

## 1. Create the Meta app

1. Go to https://developers.facebook.com/apps and click **Create app**.
2. Use case: **Connect with customers through WhatsApp**. Pick or create a business portfolio when asked.
3. In the app, open **WhatsApp → API Setup**. Meta gives you a free **test number** and a **temporary access token** (valid 24 hours).
4. Under **To**, add your own phone number as a recipient and confirm the code WhatsApp sends you. Up to 5 numbers can be added, so add any judge or demo phone the same way.

## 2. A token that doesn't expire

The temporary token dies after 24 hours. For the demo, make a permanent one:

1. Go to **Business settings → Users → System users**, then **Add**. Name it "stylist" with the Admin role.
2. **Assign assets**: add your app with full control.
3. **Generate new token**: choose your app, then the permissions `whatsapp_business_messaging` and `whatsapp_business_management`. Copy the token.

## 3. Settings

| Name | Where to find it |
|---|---|
| `WHATSAPP_TOKEN` | the system-user token from step 2 |
| `WHATSAPP_PHONE_ID` | API Setup → **Phone number ID** (not the phone number) |
| `WHATSAPP_APP_SECRET` | App settings → Basic → **App secret** |
| `WHATSAPP_VERIFY_TOKEN` | any long random string you make up |
| `WHATSAPP_DISPLAY_NUMBER` | the test number as people should see it, e.g. `+1 555 010 0100` |
| `CRON_SECRET` | any long random string (for the morning note) |

Add each one to `.env.local`, and to Vercel production with one command per name:

```bash
vercel env add WHATSAPP_TOKEN production
```

## 4. Webhook

Do this after deploying, so the route exists.

1. In the app, go to **WhatsApp → Configuration → Webhook → Edit**.
2. Callback URL: `https://wardrobe-stylist-tan.vercel.app/api/whatsapp`
3. Verify token: the same value as `WHATSAPP_VERIFY_TOKEN`.
4. **Verify and save**, then under **Webhook fields** subscribe to `messages`.

## 5. Link and test

1. In the app, go to **Settings → Text your stylist on WhatsApp → Get a code**.
2. Send the 6 digits to the test number from your phone. It replies "Linked — text me anytime."
3. Text "drinks after work". You should get a reply, the look, and three buttons.

## 6. Morning note template

This is optional; until it's approved, the note falls back to Meta's `hello_world`.

1. Go to **WhatsApp Manager → Message templates → Create**.
2. Category: **Utility**. Name: `morning_look`. Language: English (US).
3. Body: `Morning! {{1}}`. Add a quick-reply button: `See the look`.
4. Submit. Approval usually takes minutes to hours.

To use the fallback until then, set `WHATSAPP_TEMPLATE=hello_world` on Vercel.
