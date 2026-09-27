import type { AdminQuestion, McqChoice, QuestionType, ReferenceAnswer } from '../types'
import { normalizeError, type TestoError } from '../errors'
import { sanitizeText } from '../sanitize'
import { createClient } from '../supabase/client'
import type { ServiceResult } from './exam-service'

export interface McqChoiceInput extends McqChoice {
  isCorrect: boolean
}

export interface QuestionInput {
  type: QuestionType
  text: string
  points?: number
  choices?: McqChoiceInput[]
  referenceAnswers?: ReferenceAnswer[]
}

type QuestionWrite = Pick<
  AdminQuestion,
  'type' | 'text' | 'points' | 'mcq_choices' | 'correct_choice' | 'reference_answers'
>

type PrepareQuestionResult =
  | { value: QuestionWrite; error: null }
  | { value: null; error: TestoError }

function validationError(message: string): TestoError {
  return { code: 'validation_error', message }
}

function invalidQuestion(message: string): PrepareQuestionResult {
  return { value: null, error: validationError(message) }
}

function prepareQuestion(input: QuestionInput): PrepareQuestionResult {
  const text = typeof input.text === 'string' ? sanitizeText(input.text).trim() : ''
  if (!text) return invalidQuestion('Question text is required.')

  const points = input.points ?? 1
  if (!Number.isFinite(points) || points <= 0) {
    return invalidQuestion('Question points must be greater than zero.')
  }

  if (input.type === 'mcq') {
    const choices = input.choices ?? []
    if (choices.length < 2) {
      return invalidQuestion('An MCQ requires at least two choices.')
    }

    if (choices.some(({ id, text: choiceText }) => !id.trim() || !sanitizeText(choiceText).trim())) {
      return invalidQuestion('Every choice needs an id and text.')
    }

    const normalizedChoices = choices.map(({ id, text: choiceText, isCorrect }) => ({
      id: id.trim(),
      text: sanitizeText(choiceText).trim(),
      isCorrect,
    }))
    if (new Set(normalizedChoices.map(({ id }) => id)).size !== normalizedChoices.length) {
      return invalidQuestion('Choice ids must be unique.')
    }

    const correctChoices = normalizedChoices.filter(({ isCorrect }) => isCorrect)
    if (correctChoices.length !== 1) {
      return invalidQuestion('An MCQ must have exactly one correct choice.')
    }

    return {
      value: {
        type: input.type,
        text,
        points,
        mcq_choices: normalizedChoices.map(({ id, text: choiceText }) => ({ id, text: choiceText })),
        correct_choice: correctChoices[0].id.trim(),
        reference_answers: null,
      },
      error: null,
    }
  }

  const references = input.referenceAnswers ?? []
  if (references.length < 1) {
    return invalidQuestion('An essay requires at least one reference answer.')
  }
  if (references.some(({ id, text: answerText }) => !id.trim() || !sanitizeText(answerText).trim())) {
    return invalidQuestion('Every reference answer needs an id and text.')
  }
  const normalizedReferences = references.map(({ id, text: answerText }) => ({
    id: id.trim(),
    text: sanitizeText(answerText).trim(),
  }))
  if (new Set(normalizedReferences.map(({ id }) => id)).size !== normalizedReferences.length) {
    return invalidQuestion('Reference answer ids must be unique.')
  }

  return {
    value: {
      type: input.type,
      text,
      points,
      mcq_choices: null,
      correct_choice: null,
      reference_answers: normalizedReferences,
    },
    error: null,
  }
}

export async function createQuestion(
  examId: string,
  input: QuestionInput,
): Promise<ServiceResult<AdminQuestion>> {
  if (!examId) return { data: null, error: validationError('Exam id is required.') }
  const prepared = prepareQuestion(input)
  if (prepared.error) return { data: null, error: prepared.error }

  try {
    const client = createClient()
    const { data: lastQuestion, error: orderError } = await client
      .from('questions')
      .select('order')
      .eq('exam_id', examId)
      .order('order', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (orderError) throw orderError

    const { data, error } = await client
      .from('questions')
      .insert({
        ...prepared.value,
        exam_id: examId,
        order: lastQuestion ? lastQuestion.order + 1 : 1,
      })
      .select('*')
      .single()

    if (error) throw error
    return { data: data as AdminQuestion, error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

export async function listQuestions(examId: string): Promise<ServiceResult<AdminQuestion[]>> {
  if (!examId) return { data: null, error: validationError('Exam id is required.') }

  try {
    const { data, error } = await createClient()
      .from('questions')
      .select('*')
      .eq('exam_id', examId)
      .order('order', { ascending: true })

    if (error) throw error
    return { data: (data ?? []) as AdminQuestion[], error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

export async function updateQuestion(
  questionId: string,
  input: QuestionInput,
): Promise<ServiceResult<AdminQuestion>> {
  if (!questionId) return { data: null, error: validationError('Question id is required.') }
  const prepared = prepareQuestion(input)
  if (prepared.error) return { data: null, error: prepared.error }

  try {
    const { data, error } = await createClient()
      .from('questions')
      .update(prepared.value)
      .eq('id', questionId)
      .select('*')
      .single()

    if (error) throw error
    return { data: data as AdminQuestion, error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

export async function deleteQuestion(questionId: string): Promise<ServiceResult<boolean>> {
  if (!questionId) return { data: null, error: validationError('Question id is required.') }

  try {
    const { error } = await createClient().from('questions').delete().eq('id', questionId)
    if (error) throw error
    return { data: true, error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}
