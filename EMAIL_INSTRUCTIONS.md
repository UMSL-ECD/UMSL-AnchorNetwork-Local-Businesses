Subject: STL Business Directory - Ready to Go!

---

Hey!

Here's the STL Business Directory project we worked on. Everything is ready -- the website works right now with the data from the library's CSV. I've also included a script that uses AI to make the search experience much better by adding plain-English descriptions and tags to every business. That part is optional but highly recommended.

I'll walk you through everything below.

---

## What's in the Zip

When you unzip `STL_Business_Directory.zip`, you'll see:

- **index.html** -- The website (open this in a browser to see it)
- **styles.css** -- How the website looks
- **app.js** -- The search and filter logic
- **businesses.json** -- The business data (12,278 businesses, already cleaned and ready)
- **scripts/enrich.py** -- The AI enrichment script (optional, makes search much better)
- **scripts/prepare_data.py** -- The data cleaning script (already ran, you don't need to touch this)
- **scripts/categories.json** -- The 25 business categories
- **Ref-Directory.csv** -- The original library data

---

## Step 1: See the Website Right Now

You can view the website locally before doing anything else:

1. Install Python if you don't have it: go to https://www.python.org/downloads/ and download the latest version. During installation, **check the box that says "Add Python to PATH"**.

2. Open a terminal:
   - **Windows**: Press the Windows key, type "cmd", and press Enter
   - **Mac**: Press Cmd+Space, type "Terminal", and press Enter

3. Navigate to the project folder. If you unzipped it to your Desktop:
   - **Windows**: `cd Desktop\STL_business_directory`
   - **Mac**: `cd ~/Desktop/STL_business_directory`

4. Start the local server:
   ```
   python -m http.server 8080
   ```

5. Open your browser and go to: **http://localhost:8080**

You should see the directory with a search bar, category tiles, and business cards!

To stop the server, go back to the terminal and press Ctrl+C.

---

## Step 2 (Optional but Recommended): Enrich the Data with AI

Right now, the website works with categories derived from the library's official NAICS codes, plus basic search tags. But the AI enrichment script makes searching *much* better by adding:
- 5-10 search tags per business (like "deck builder", "oil change", "tax prep")
- A plain-English description of what each business does

This makes searching way more useful. For example, without enrichment, searching "deck builder" won't find construction companies. With enrichment, it will. Category itself is untouched by this step -- it stays based on the official NAICS code from step 1.

### How much does it cost?

The AI enrichment uses OpenAI's API, which costs money -- but very little. Based on our test run:
- **Estimated cost: about $2-4 for all 12,278 businesses**
- **Estimated time: about 7 hours** (it runs in the background, you can do other things)
- The script saves progress every 50 records, so if it stops for any reason, you just run it again and it picks up where it left off

### Setting Up Your OpenAI API Key

1. Go to https://platform.openai.com/signup and create an account (or sign in if you have one)

2. Add payment method:
   - Go to https://platform.openai.com/settings/organization/billing/overview
   - Click "Add payment method"
   - Add a credit card
   - I recommend setting a usage limit of $10 so you don't accidentally spend more than that:
     - Go to https://platform.openai.com/settings/organization/limits
     - Set a monthly budget limit

3. Create an API key:
   - Go to https://platform.openai.com/api-keys
   - Click "Create new secret key"
   - Give it a name like "STL Directory"
   - **Copy the key immediately** -- you won't be able to see it again!
   - It will look something like: `sk-proj-abc123...xyz`

### Running the Enrichment Script

1. Open your terminal and navigate to the project folder (same as Step 1)

2. Install the OpenAI Python package (one-time):
   ```
   pip install openai
   ```

3. Set your API key and run the script:

   **Windows (Command Prompt):**
   ```
   set OPENAI_API_KEY=sk-proj-your-key-here
   python scripts/enrich.py
   ```

   **Windows (PowerShell):**
   ```
   $env:OPENAI_API_KEY="sk-proj-your-key-here"
   python scripts/enrich.py
   ```

   **Mac/Linux:**
   ```
   export OPENAI_API_KEY="sk-proj-your-key-here"
   python scripts/enrich.py
   ```

4. You'll see progress printed for each business:
   ```
   [1/12278] 100 Percent Real Trucking LLC... -> Local courier and delivery service serving the St. Louis area.
   [2/12278] 108 Stitches LLC... -> Custom embroidery shop for apparel and promotional items.
   ...
   ```

5. **It's safe to stop and resume.** If you need to close your computer, just press Ctrl+C. The script saves progress every 50 records. When you run it again, it picks up where it left off.

6. When it finishes, your `businesses.json` file will be updated with the enriched data. Just refresh the website to see the improvements.

**Tip:** To test it first with just 10 records (takes about 30 seconds, costs less than a penny):
```
python scripts/enrich.py --dry-run
```

---

## Step 3: Host It for Free on GitHub Pages

This makes the website available to anyone on the internet, for free, forever.

### One-Time Setup: Create a GitHub Account

1. Go to https://github.com and click "Sign up"
2. Create a free account with your email

### Install Git

- **Windows**: Download from https://git-scm.com/download/win and install (use all the default settings)
- **Mac**: Open Terminal and type `git --version`. If it's not installed, it will prompt you to install it.

### Upload the Project and Enable GitHub Pages

1. Go to https://github.com and click the **+** button in the top right, then **"New repository"**

2. Fill in:
   - Repository name: `stl-business-directory`
   - Description: `Public business directory for the St. Louis area`
   - Select **Public**
   - Do NOT check any of the boxes (no README, no .gitignore, no license)
   - Click **"Create repository"**

3. Open your terminal, navigate to the project folder, and run these commands one at a time:

   ```
   git init
   git add index.html styles.css app.js businesses.json
   git commit -m "STL Business Directory"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/stl-business-directory.git
   git push -u origin main
   ```

   Replace `YOUR-USERNAME` with your actual GitHub username.

   (It will ask you to log in to GitHub the first time.)

4. Enable GitHub Pages:
   - Go to your repository on GitHub: `https://github.com/YOUR-USERNAME/stl-business-directory`
   - Click **"Settings"** (tab at the top)
   - In the left sidebar, click **"Pages"**
   - Under "Source", select **"Deploy from a branch"**
   - Under "Branch", select **"main"** and **"/ (root)"**
   - Click **"Save"**

5. Wait 1-2 minutes, then your site will be live at:
   **https://YOUR-USERNAME.github.io/stl-business-directory/**

### Updating the Site After Enrichment

After you run the AI enrichment script, you'll want to update the live site with the improved data:

```
git add businesses.json
git commit -m "Update with AI-enriched data"
git push
```

Wait a minute or two and the live site will update automatically.

---

## Quick Reference

| What | Command |
|------|---------|
| View site locally | `python -m http.server 8080` then open http://localhost:8080 |
| Test enrichment (10 records) | `python scripts/enrich.py --dry-run` |
| Run full enrichment | `python scripts/enrich.py` |
| Check enrichment progress | Look at the terminal output, or re-run the script (it shows how many are done) |
| Update live site | `git add businesses.json && git commit -m "Update data" && git push` |

---

Let me know if you have any questions!
