# Supabase Email Configuration

## Problem: Email Links Point to Localhost

When users register or reset their password, Supabase sends confirmation emails with links that point to `http://localhost:3000` instead of your production domain.

## Solution

### Step 1: Configure Supabase Site URL

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/hmuhvsdlvfewjbnlfydf

2. Navigate to **Authentication → URL Configuration**

3. Update **Site URL**:
   ```
   https://your-production-domain.vercel.app
   ```

4. Add **Redirect URLs** (one per line):
   ```
   http://localhost:3000/**
   https://your-production-domain.vercel.app/**
   ```

5. Click **Save**

### Step 2: Configure Vercel Environment Variable (Optional but Recommended)

Add your production URL as an environment variable in Vercel:

```bash
# Add for Production
vercel env add NEXT_PUBLIC_SITE_URL production
# Enter: https://your-production-domain.vercel.app

# Add for Preview
vercel env add NEXT_PUBLIC_SITE_URL preview
# Enter: https://your-production-domain.vercel.app
```

Then redeploy:

```bash
vercel --prod
```

### Step 3: Verify Email Templates

In **Authentication → Email Templates**, make sure templates use the variable `{{ .SiteURL }}`:

**Confirm signup template:**
```html
<h2>Confirm your signup</h2>
<p>Follow this link to confirm your user:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your mail</a></p>
```

**Reset password template:**
```html
<h2>Reset Password</h2>
<p>Follow this link to reset your password:</p>
<p><a href="{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a></p>
```

## How It Works

The app automatically detects the correct site URL in this order:

1. `NEXT_PUBLIC_SITE_URL` (if set in environment variables)
2. `NEXT_PUBLIC_VERCEL_URL` (automatically set by Vercel)
3. `http://localhost:3000` (development fallback)

See `lib/get-site-url.ts` for implementation details.

## Testing

1. Register a new user account
2. Check your email inbox
3. Click the confirmation link
4. Verify it redirects to your production domain (not localhost)

## Troubleshooting

**Links still go to localhost:**
- Clear your browser cache
- Wait a few minutes for Supabase configuration to propagate
- Check Supabase Dashboard → Authentication → URL Configuration

**Email not received:**
- Check spam folder
- Verify SMTP is configured in Supabase (Auth → Email Templates → Settings)
- For development, check Supabase Dashboard → Authentication → Users for confirmation status

**Redirect loops:**
- Make sure Site URL matches your actual domain exactly (with `https://`)
- Check that your domain doesn't have trailing slashes
- Verify Redirect URLs include `/**` wildcard pattern
