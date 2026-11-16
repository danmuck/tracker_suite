export interface Ingredient {
  name: string;
  quantity?: number;
  unit?: string;
}

export interface Recipe {
  _id: string;
  name: string;
  servings?: number;
  ingredients: Ingredient[];
  instructions: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RecipeFormData {
  name: string;
  servings?: number;
  ingredients: Ingredient[];
  instructions: string;
  tags: string[];
}

export interface ShoppingItem {
  _id: string;
  name: string;
  quantity?: number;
  unit?: string;
  checked: boolean;
  recipeId?: string;
  /** Name of the source recipe, when the item was added from one */
  recipeName?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingItemFormData {
  name: string;
  quantity?: number;
  unit?: string;
  checked?: boolean;
}
