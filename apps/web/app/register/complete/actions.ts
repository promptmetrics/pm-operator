'use server';

import { redirect } from 'next/navigation';
import { createAuthServerClient } from '@/lib/auth/server';

interface CompleteOnboardingInput {
  userId: string;
  painfulToolStackTask: string;
  stackTags: string[];
  returnUrl: string;
}

export async function completeOnboarding(input: CompleteOnboardingInput) {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || user.id !== input.userId) {
    return { error: 'You must be signed in to complete onboarding.' };
  }

  const task = input.painfulToolStackTask.trim();
  if (!task) {
    return { error: 'Describe the problem you are working on.' };
  }

  const { data: existing } = await supabase
    .from('users')
    .select('preferences')
    .eq('id', user.id)
    .single();

  const preferences = {
    ...(typeof existing?.preferences === 'object' && existing.preferences !== null
      ? existing.preferences
      : {}),
    stackTags: input.stackTags,
  };

  const { error: updateError } = await supabase
    .from('users')
    .update({
      painful_tool_stack_task: task,
      preferences,
    })
    .eq('id', user.id);

  if (updateError) {
    return { error: updateError.message };
  }

  redirect(input.returnUrl);
}
