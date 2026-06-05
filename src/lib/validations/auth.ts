import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const registerSchema = z.object({
  full_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100),

  email: z
    .string()
    .email('Invalid email address'),

  phone: z
    .string()
    .regex(
      /^[0-9]{10}$/,
      'Phone number must be exactly 10 digits'
    ),

  password: z
    .string()
    .min(
      8,
      'Password must be at least 8 characters'
    )
    .regex(
      /[A-Z]/,
      'Password must contain at least one uppercase letter'
    )
    .regex(
      /[0-9]/,
      'Password must contain at least one number'
    )
    .regex(
      /[^A-Za-z0-9]/,
      'Password must contain at least one special character'
    ),

  confirm_password:
    z.string(),

}).refine(
  (data) =>
    data.password ===
    data.confirm_password,
  {
    message:
      'Passwords do not match',
    path: [
      'confirm_password',
    ],
  }
)

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirm_password: z.string(),
}).refine((data) => data.password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

export type LoginFormData = z.infer<typeof loginSchema>
export type RegisterFormData = z.infer<typeof registerSchema>
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>
