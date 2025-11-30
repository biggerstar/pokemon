import { BaseEntity, Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm"

@Entity()
export class ProductEntity extends BaseEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string

  @Column({ type: 'varchar' })
  type: string

  @Column({ type: 'varchar' })
  title: string

  @Column({ type: 'varchar', nullable: true })
  keyword: string

  @Column({ type: 'varchar' })
  detailUrl: string

  @Column({ type: 'int' })
  deliveryDay: number

  @Column({ type: 'json' })
  data: Record<any, any>

  @CreateDateColumn()
  created_time: Date

  @UpdateDateColumn()
  updated_time: Date
}
