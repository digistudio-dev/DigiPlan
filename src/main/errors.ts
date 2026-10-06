// Erreurs métier avec message français destiné à l'utilisateur.

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound = (what = "L'élément") => new AppError('not_found', `${what} est introuvable ou a été supprimé.`)

export const proRequired = () =>
  new AppError('pro_required', 'Cette fonctionnalité est disponible avec DigiPlan Pro.')

export const invalid = (message: string) => new AppError('invalid', message)
