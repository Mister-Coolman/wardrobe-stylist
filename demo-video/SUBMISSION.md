# Submission answers

## Project Description

**Wardrobe Stylist is a personal stylist you can text, who knows every piece in your closet.**

I own plenty of clothes and still wear the same few things. Every morning is a decision made without knowing what the day holds, and packing for a trip is that problem multiplied by every day away. A human stylist would fix it, but only if they knew your closet, your week and your laundry. This one does.

- **Scan your closet once.** Pan your phone across the rail, hold pieces up one at a time, or take a photo. Each garment is found, cut out and tagged (category, colours, formality, warmth, rain-safe, brand and fit). Duplicates are merged, and nothing is used until you confirm it.
- **One look every morning.** It's built from your calendar (which sets the dress code), the forecast where you'll be, and only the clothes that are clean. Each piece says why it's there. *Fitting notes* show every check that ran and anything the stylist changed on the way ("↺ Swapped suede loafers → boots: 80% rain").
- **Text your stylist, in the app or on WhatsApp.** It's one shared conversation.
  - "Something for drinks after work" gets a look, then its picture.
  - "I spilled coffee on the white shirt" sends the shirt to the laundry.
  - "I wore the navy polo and jeans today" logs the wear, and pieces at their wear limit go to the laundry.
  - Send a photo to add clothes, ask "how do I look?", or say "match this look".
  - It remembers your preferences and sends a look every morning without being asked.
- **See it your way:** as a flat lay, on a mannequin, on a photo of you, or as just the pieces.
- **Trips.** It plans a look for every day and a packing checklist that respects how often *you* rewear each kind of clothing. If the closet can't cover the trip, it says exactly what's short.
- **One piece to buy.** It works out which single purchase would unlock the most new outfits.

It's live at **www.wardrobe-stylist.xyz**. Tap *Try the demo*: no account is needed, and you get your own copy of a real closet with a sample calendar. Everything was built during the hackathon window, 27 Oct – 4 Nov 2026.

## Describe your use of Meta products to build the submitted project

Every AI step in the product runs on a Meta model, and the stylist lives on a Meta messaging platform.

- **SAM 3.1** finds each garment in a closet video or photo and cuts it out. A rail of clothes becomes individual pieces, tracked across video frames so the same shirt isn't added twice.
- **Muse Spark** is the brain of the app:
  - **Tagging:** it reads each cutout and returns structured tags, such as category, colours, formality 1–5, warmth 1–5, rain-safe, fit and brand.
  - **Styling:** it proposes three candidate looks from the confirmed closet, the day's events and the forecast. When the app's rule engine rejects a look, it revises it.
  - **The stylist agent:** a tool-calling conversation, with tools to plan or swap looks, log wears, send pieces to the laundry, add events, plan trips and remember preferences.
  - **Photos and calendar:** it reads photos ("how do I look?", "match this look", "add these") and judges how formal each calendar event is.
  - **Checking pictures:** it checks every generated picture for missing or doubled pieces and wrong colours.
- **Muse Image** draws each look from the real cutouts: a flat lay, a mannequin, or a try-on on the user's own photo. The prompt is assembled from the pieces' tags and layering. Each picture is checked for cropping and content, and drawn once more when it fails.
- **Muse Voice Transcribe** turns hold-to-talk voice messages into stylist requests.
- **WhatsApp Cloud API** carries the same conversation as the app:
  - read receipts and typing indicators;
  - outfit cards with buttons;
  - pictures sent once they're drawn;
  - swipe-reply to change a specific look;
  - a morning message with the day's outfit.

All model calls go through one adapter layer with a real and a mock implementation, so the whole app also runs and is tested offline.

## Why are Meta's models important to your solution?

The product only works if one system can **see** clothes, **reason** about a day, and **show** the result. Meta's models cover all three, and they work together.

- **Seeing the closet is the hardest step for users, and SAM makes it one action.** Without reliable segmentation, a wardrobe app means photographing and typing in every item by hand, and nobody keeps that up. SAM 3.1 pulls separate garments out of an ordinary phone video of a closet rail. Muse Spark's vision then tags each one well enough to style with. You hold pieces up to the camera a handful at a time, instead of photographing and typing in each one.
- **Muse Spark reasons the way a stylist does, with structured output and tools.** Picking an outfit means weighing dress code, weather, laundry, layering, colour and what you wore lately. Muse Spark proposes complete looks as structured JSON that deterministic rules can check. It also revises when told what failed. As an agent, it turns casual texts ("spilled coffee on it", "I wore X today") into the right actions on real data. That split lets the stylist feel human while never suggesting something dirty, too light for the weather, or wrong for a client lunch: the model proposes, the code decides.
- **Muse Image makes the suggestion something you can picture.** A list of three garment names isn't persuasive, but a flat lay of your own clothes, drawn from your own cutouts, is. Drawing from the real pieces rather than stock images is what makes the outfit feel like yours.
- **WhatsApp puts the stylist where people already are.** A morning look arrives in a chat you already open, and you can reply in a sentence. No new habit is needed, and that is the difference between an app you try once and a stylist you keep using.
