import { shadcn } from '@clerk/themes';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
export const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#334155', colorForeground: '#1c1917',
    colorMutedForeground: '#57534e', colorDanger: '#b91c1c',
    colorBackground: '#ffffff', colorInput: '#ffffff',
    colorInputForeground: '#1c1917', colorNeutral: '#44403c',
    fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-stone-900', headerSubtitle: 'text-stone-600',
    socialButtonsBlockButtonText: 'text-stone-900', formFieldLabel: 'text-stone-900',
    footerActionLink: 'text-slate-800', footerActionText: 'text-stone-600',
    dividerText: 'text-stone-600', identityPreviewEditButton: 'text-slate-800',
    formFieldSuccessText: 'text-green-800', alertText: 'text-red-800',
    logoBox: 'mb-4', logoImage: 'h-12',
    socialButtonsBlockButton: 'border-stone-300 bg-white',
    formButtonPrimary: 'bg-slate-700 text-white',
    formFieldInput: 'bg-white text-stone-900 border-stone-300',
    footerAction: 'bg-stone-50', dividerLine: 'bg-stone-200',
    alert: 'bg-red-50', otpCodeFieldInput: 'text-stone-900 border-stone-300',
    formFieldRow: 'mb-3', main: 'gap-4',
  },
};
