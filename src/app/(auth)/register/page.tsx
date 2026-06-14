'use client'

import { Suspense } from 'react'
import RegisterForm from './register-form'

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 h-96 animate-pulse" />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  )
}