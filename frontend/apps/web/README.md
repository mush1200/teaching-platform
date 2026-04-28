This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## UI Role Naming (10-line version)

1. UI must not show system role names (`parent`, `teacher`, `admin`).
2. UI must not use `家長` or `老師` as primary identity labels.
3. Use purpose-oriented wording (what user wants to do), not identity labels.
4. Buyer-side wording should stay generic: `歡迎回來`, `探索教材`, `我的訂單`, `我的內容`.
5. Creator-side wording should stay generic: `教材工作台`, `我的教材`, `銷售與收益`.
6. Admin can use `管理員` or `平台管理`.
7. Register page is the only exception for options: `我要購買教材` / `我要上架教材`.
8. Register helper text may mention groups (家長/學生/老師), but not as main labels.
9. This rule applies to all UI copy (title/button/sidebar/CTA/empty state) in web/mobile.
10. This rule does not change DB schema, API, JWT role, or permission control.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
